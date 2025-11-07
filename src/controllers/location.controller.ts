import { Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  locationSharingSessionsTable,
  locationUpdatesTable,
  conversationsTable,
  transactions,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { eq, and, desc } from "drizzle-orm";
import { io } from "../index";
import axios from "axios";
import { config } from "../constants/config";

// Helper function to calculate distance using Google Distance Matrix API
async function calculateDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ distance: string; duration: string } | null> {
  try {
    const apiKey = config.gcs.googleApiKey;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      return null;
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    const response = await axios.get(url, {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        key: apiKey,
        mode: "driving",
      },
    });

    if (
      response.data.status === "OK" &&
      response.data.rows[0]?.elements[0]?.status === "OK"
    ) {
      const element = response.data.rows[0].elements[0];
      return {
        distance: element.distance.text, // e.g., "5.2 km"
        duration: element.duration.text, // e.g., "15 mins"
      };
    }

    return null;
  } catch (error) {
    console.error("Error calculating distance:", error);
    return null;
  }
}

function getHaversineDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLon = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function findNearbyPlaces(midpoint: {
  lat: number;
  lng: number;
}): Promise<any[]> {
  const apiKey = config.gcs.googleApiKey;
  if (!apiKey) {
    console.error("Google Maps API key not configured");
    return [];
  }

  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const body = {
    includedTypes: ["restaurant", "cafe", "bakery"],
    maxResultCount: 12,
    locationRestriction: {
      circle: {
        center: {
          latitude: midpoint.lat,
          longitude: midpoint.lng,
        },
        radius: 200.0, // 200 meters
      },
    },
  };

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask":
      "places.displayName,places.photos,places.formattedAddress,places.types,places.location",
  };

  try {
    const response = await axios.post(url, body, { headers });
    if (response.data.places && response.data.places.length > 0) {
      return response.data.places.map((place: any) => {
        const photoUrl =
          place.photos && place.photos.length > 0
            ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
            : null;
        return {
          name: place.displayName.text,
          address: place.formattedAddress,
          photoUrl: photoUrl,
          types: place.types,
          location: place.location
            ? {
                lat: place.location.latitude,
                lng: place.location.longitude,
              }
            : null,
        };
      });
    }
    return [];
  } catch (error: any) {
    console.error(
      "Error fetching nearby places:",
      error.response?.data || error.message
    );
    return [];
  }
}

// Start sharing location
export const startLocationSharing = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Get conversation to verify user is participant
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) throw new AppError("Conversation not found", 404);

    // Verify user is a participant
    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError(
        "Not authorized to share location in this conversation",
        403
      );
    }

    // Determine which participant is sharing
    const isParticipant1 = conversation.participant1Id === userId;

    // Check if there's an active session
    const [existingSession] = await db
      .select()
      .from(locationSharingSessionsTable)
      .where(
        and(
          eq(locationSharingSessionsTable.conversationId, conversationId),
          eq(locationSharingSessionsTable.status, "active")
        )
      )
      .limit(1);

    let session;
    if (existingSession) {
      // Delete old location updates for this user to ensure fresh distance calculations
      try {
        await db
          .delete(locationUpdatesTable)
          .where(
            and(
              eq(locationUpdatesTable.sessionId, existingSession.id),
              eq(locationUpdatesTable.userId, userId)
            )
          );

        console.log(
          `🧹 Cleaned up old location updates for user ${userId} in session ${existingSession.id}`
        );
      } catch (error) {
        console.error("Error cleaning up old location updates:", error);
        // Continue anyway - this is not critical
      }

      // Update existing session
      const updateData = isParticipant1
        ? {
            participant1Sharing: true,
            participant1StartedAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            participant2Sharing: true,
            participant2StartedAt: new Date(),
            updatedAt: new Date(),
          };

      [session] = await db
        .update(locationSharingSessionsTable)
        .set(updateData)
        .where(eq(locationSharingSessionsTable.id, existingSession.id))
        .returning();
    } else {
      // Create new session
      const sessionData = {
        conversationId,
        participant1Sharing: isParticipant1,
        participant2Sharing: !isParticipant1,
        participant1StartedAt: isParticipant1 ? new Date() : null,
        participant2StartedAt: !isParticipant1 ? new Date() : null,
        status: "active" as const,
      };

      [session] = await db
        .insert(locationSharingSessionsTable)
        .values(sessionData)
        .returning();
    }

    // Emit socket event to the conversation room (so both users receive it)
    io.to(conversationId).emit("location_sharing_started", {
      conversationId,
      sessionId: session.id,
      userId,
    });

    res.status(200).json({
      message: "Location sharing started successfully",
      session,
    });
  } catch (error) {
    console.error("Error starting location sharing:", error);
    throw error;
  }
};

// Stop sharing location
export const stopLocationSharing = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Get conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) throw new AppError("Conversation not found", 404);

    const isParticipant1 = conversation.participant1Id === userId;

    // Get active session
    const [session] = await db
      .select()
      .from(locationSharingSessionsTable)
      .where(
        and(
          eq(locationSharingSessionsTable.conversationId, conversationId),
          eq(locationSharingSessionsTable.status, "active")
        )
      )
      .limit(1);

    if (!session) throw new AppError("No active location sharing session", 404);

    // Update session to stop sharing for this user
    const updateData = isParticipant1
      ? {
          participant1Sharing: false,
          participant1StoppedAt: new Date(),
          updatedAt: new Date(),
        }
      : {
          participant2Sharing: false,
          participant2StoppedAt: new Date(),
          updatedAt: new Date(),
        };

    const [updatedSession] = await db
      .update(locationSharingSessionsTable)
      .set(updateData)
      .where(eq(locationSharingSessionsTable.id, session.id))
      .returning();

    // If neither participant is sharing, mark session as ended
    if (
      !updatedSession.participant1Sharing &&
      !updatedSession.participant2Sharing
    ) {
      await db
        .update(locationSharingSessionsTable)
        .set({ status: "ended" })
        .where(eq(locationSharingSessionsTable.id, session.id));
    }

    // Emit socket event to the conversation room (so both users receive it)
    io.to(conversationId).emit("location_sharing_stopped", {
      conversationId,
      sessionId: session.id,
      userId,
    });

    res.status(200).json({
      message: "Location sharing stopped successfully",
      session: updatedSession,
    });
  } catch (error) {
    console.error("Error stopping location sharing:", error);
    throw error;
  }
};

// Update location
export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { latitude, longitude } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);
    if (!latitude || !longitude)
      throw new AppError("Latitude and longitude are required", 400);

    // Get active session
    const [session] = await db
      .select()
      .from(locationSharingSessionsTable)
      .where(
        and(
          eq(locationSharingSessionsTable.conversationId, conversationId),
          eq(locationSharingSessionsTable.status, "active")
        )
      )
      .limit(1);

    if (!session) throw new AppError("No active location sharing session", 404);

    // Get conversation for meetup coordinates
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation?.transactionId) {
      throw new AppError("No transaction found for this conversation", 404);
    }

    // Get transaction with meetup coordinates
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, conversation.transactionId))
      .limit(1);

    // Calculate distance to meetup location if coordinates are available
    let distanceData = null;
    if (transaction?.meetupCoordinates) {
      const meetupCoords = transaction.meetupCoordinates as {
        lat: number;
        lng: number;
      };
      distanceData = await calculateDistance(
        { lat: parseFloat(latitude), lng: parseFloat(longitude) },
        meetupCoords
      );
    }

    // Create location update FIRST (so it's available for proximity check)
    const [locationUpdate] = await db
      .insert(locationUpdatesTable)
      .values({
        sessionId: session.id,
        userId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        distance: distanceData?.distance || null,
      })
      .returning();

    // Emit socket event to conversation room with location update IMMEDIATELY
    const locationUpdatePayload = {
      conversationId,
      sessionId: session.id,
      userId,
      location: {
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
      },
      distance: distanceData?.distance || null,
      duration: distanceData?.duration || null,
      timestamp: new Date().toISOString(),
    };

    console.log(`📍 REST: Emitting location update for user ${userId}:`, {
      distance: distanceData?.distance,
      conversationId,
    });

    io.to(conversationId).emit("location_updated", locationUpdatePayload);

    // Send response immediately (don't wait for proximity check)
    res.status(200).json({
      message: "Location updated successfully",
      locationUpdate,
      distance: distanceData,
    });

    // --- Proximity check logic (non-blocking, fire-and-forget) ---
    // This runs AFTER sending the response so it doesn't block real-time updates
    const checkProximityAndEmitNearbyPlaces = async () => {
      try {
        const otherUserId =
          userId === conversation.participant1Id
            ? conversation.participant2Id
            : conversation.participant1Id;

        const [otherUserLocationUpdate] = await db
          .select()
          .from(locationUpdatesTable)
          .where(
            and(
              eq(locationUpdatesTable.sessionId, session.id),
              eq(locationUpdatesTable.userId, otherUserId)
            )
          )
          .orderBy(desc(locationUpdatesTable.createdAt))
          .limit(1);

        if (otherUserLocationUpdate) {
          const user1Loc = {
            lat: parseFloat(latitude),
            lng: parseFloat(longitude),
          };
          const user2Loc = {
            lat: parseFloat(otherUserLocationUpdate.latitude),
            lng: parseFloat(otherUserLocationUpdate.longitude),
          };

          const distanceBetweenUsers = getHaversineDistance(user1Loc, user2Loc);
          console.log(
            `📏 REST: Distance between users: ${distanceBetweenUsers.toFixed(
              3
            )} km`
          );

          if (distanceBetweenUsers <= 0.2) {
            // 0.2 km = 200 meters
            console.log(`✅ REST: Users are nearby. Finding meetup spots.`);
            const midpoint = {
              lat: (user1Loc.lat + user2Loc.lat) / 2,
              lng: (user1Loc.lng + user2Loc.lng) / 2,
            };

            const nearbyPlaces = await findNearbyPlaces(midpoint);

            if (nearbyPlaces.length > 0) {
              console.log(
                `📍 REST: Found ${nearbyPlaces.length} nearby places. Emitting to conversation ${conversationId}.`
              );
              io.to(conversationId).emit("nearby_places", {
                conversationId,
                places: nearbyPlaces,
              });
            }
          }
        }
      } catch (error) {
        console.error("Error in proximity check:", error);
        // Don't throw - this is a background task
      }
    };

    // Run proximity check in the background (don't await)
    checkProximityAndEmitNearbyPlaces();
  } catch (error) {
    console.error("Error updating location:", error);
    throw error;
  }
};

// Get current location sharing session
export const getLocationSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Get conversation to determine participant IDs
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) throw new AppError("Conversation not found", 404);

    // Get active session
    const [session] = await db
      .select()
      .from(locationSharingSessionsTable)
      .where(
        and(
          eq(locationSharingSessionsTable.conversationId, conversationId),
          eq(locationSharingSessionsTable.status, "active")
        )
      )
      .limit(1);

    if (!session) {
      return res.status(200).json({
        session: null,
        locationUpdates: [],
      });
    }

    // Only get recent location updates (from last 10 minutes) for users who are currently sharing
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const locationUpdates = await db
      .select()
      .from(locationUpdatesTable)
      .where(eq(locationUpdatesTable.sessionId, session.id))
      .orderBy(desc(locationUpdatesTable.createdAt))
      .limit(10);

    // Filter updates to only include recent ones from users who are currently sharing
    const filteredUpdates = locationUpdates.filter((update) => {
      const updateTime = new Date(update.createdAt);
      const isRecent = updateTime >= tenMinutesAgo;

      // Check if this user is currently sharing
      const isParticipant1 = update.userId === conversation.participant1Id;
      const isCurrentlySharing = isParticipant1
        ? session.participant1Sharing
        : session.participant2Sharing;

      return isRecent && isCurrentlySharing;
    });

    // Add participant IDs to session response
    const sessionWithParticipants = {
      ...session,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
    };

    // Check if both users are sharing and nearby, then find nearby places
    let nearbyPlaces: any[] = [];
    if (
      session.participant1Sharing &&
      session.participant2Sharing &&
      filteredUpdates.length >= 2
    ) {
      // Get the latest location for each user
      const participant1Update = filteredUpdates.find(
        (u) => u.userId === conversation.participant1Id
      );
      const participant2Update = filteredUpdates.find(
        (u) => u.userId === conversation.participant2Id
      );

      if (participant1Update && participant2Update) {
        const user1Loc = {
          lat: parseFloat(participant1Update.latitude),
          lng: parseFloat(participant1Update.longitude),
        };
        const user2Loc = {
          lat: parseFloat(participant2Update.latitude),
          lng: parseFloat(participant2Update.longitude),
        };

        const distanceBetweenUsers = getHaversineDistance(user1Loc, user2Loc);
        console.log(
          `📏 GET Session: Distance between users: ${distanceBetweenUsers.toFixed(
            3
          )} km`
        );

        if (distanceBetweenUsers <= 0.2) {
          // 0.2 km = 200 meters
          console.log(
            `✅ GET Session: Users are nearby. Finding meetup spots.`
          );
          const midpoint = {
            lat: (user1Loc.lat + user2Loc.lat) / 2,
            lng: (user1Loc.lng + user2Loc.lng) / 2,
          };

          nearbyPlaces = await findNearbyPlaces(midpoint);
          console.log(
            `📍 GET Session: Found ${nearbyPlaces.length} nearby places.`
          );
        }
      }
    }

    res.status(200).json({
      session: sessionWithParticipants,
      locationUpdates: filteredUpdates,
      nearbyPlaces,
    });
  } catch (error) {
    console.error("Error getting location session:", error);
    throw error;
  }
};

// Handle location update via WebSocket (called from socket handler)
export const handleLocationUpdate = async (
  userId: string,
  data: { conversationId: string; latitude: number; longitude: number }
) => {
  const { conversationId, latitude, longitude } = data;

  // Get active session
  const [session] = await db
    .select()
    .from(locationSharingSessionsTable)
    .where(
      and(
        eq(locationSharingSessionsTable.conversationId, conversationId),
        eq(locationSharingSessionsTable.status, "active")
      )
    )
    .limit(1);

  if (!session) {
    console.error(
      `❌ No active location sharing session found for conversation ${conversationId}`
    );
    return; // Return instead of throwing for socket handler
  }

  // Get conversation details
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conversation) {
    console.error(`❌ Conversation not found: ${conversationId}`);
    return;
  }

  // --- Proximity check logic starts here ---
  const otherUserId =
    userId === conversation.participant1Id
      ? conversation.participant2Id
      : conversation.participant1Id;

  const [otherUserLocationUpdate] = await db
    .select()
    .from(locationUpdatesTable)
    .where(
      and(
        eq(locationUpdatesTable.sessionId, session.id),
        eq(locationUpdatesTable.userId, otherUserId)
      )
    )
    .orderBy(desc(locationUpdatesTable.createdAt))
    .limit(1);

  if (otherUserLocationUpdate) {
    const user1Loc = { lat: latitude, lng: longitude };
    const user2Loc = {
      lat: parseFloat(otherUserLocationUpdate.latitude),
      lng: parseFloat(otherUserLocationUpdate.longitude),
    };

    const distanceBetweenUsers = getHaversineDistance(user1Loc, user2Loc);
    console.log(
      `📏 Distance between users: ${distanceBetweenUsers.toFixed(3)} km`
    );

    if (distanceBetweenUsers <= 0.2) {
      // 0.2 km = 200 meters
      console.log(`✅ Users are nearby. Finding meetup spots.`);
      const midpoint = {
        lat: (user1Loc.lat + user2Loc.lat) / 2,
        lng: (user1Loc.lng + user2Loc.lng) / 2,
      };

      const nearbyPlaces = await findNearbyPlaces(midpoint);

      if (nearbyPlaces.length > 0) {
        console.log(
          `📍 Found ${nearbyPlaces.length} nearby places. Emitting to conversation ${conversationId}.`
        );
        io.to(conversationId).emit("nearby_places", {
          conversationId,
          places: nearbyPlaces,
        });
      }
    }
  }
  // --- Proximity check logic ends here ---

  // Get transaction with meetup coordinates (for distance to destination)
  let distanceData = null;
  if (conversation.transactionId) {
    const [transaction] = await db
      .select({ meetupCoordinates: transactions.meetupCoordinates })
      .from(transactions)
      .where(eq(transactions.id, conversation.transactionId))
      .limit(1);

    if (transaction?.meetupCoordinates) {
      const meetupCoords = transaction.meetupCoordinates as {
        lat: number;
        lng: number;
      };
      distanceData = await calculateDistance(
        { lat: latitude, lng: longitude },
        meetupCoords
      );
    }
  }

  // Create location update in DB
  await db.insert(locationUpdatesTable).values({
    sessionId: session.id,
    userId,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    distance: distanceData?.distance || null,
  });

  // Emit socket event to both users with location update for distance to destination
  const locationUpdatePayload = {
    conversationId,
    sessionId: session.id,
    userId,
    location: {
      lat: latitude,
      lng: longitude,
    },
    distance: distanceData?.distance || null,
    duration: distanceData?.duration || null,
    timestamp: new Date().toISOString(),
  };

  io.to(conversationId).emit("location_updated", locationUpdatePayload);
};

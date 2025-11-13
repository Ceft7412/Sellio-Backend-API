import { Response } from "express";
import { AppError } from "../middleware/error.middleware.js";
import {
  locationSharingSessionsTable,
  locationUpdatesTable,
  conversationsTable,
  transactions,
} from "../db/schema.js";
import { db } from "../db/connection.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { eq, and, desc, gte } from "drizzle-orm";
import { io } from "../index.js";
import axios from "axios";
import { config } from "../constants/config.js";
import {
  LocationCoordinates,
  DistanceInfo,
  LocationSharingStartedPayload,
  LocationSharingStoppedPayload,
  LocationUpdatedPayload,
  UpdateLocationData,
} from "../types/location.types.js";

// Constants
const LOCATION_UPDATE_RETENTION_MINUTES = 30; // Keep location history for 30 minutes
const MAX_LOCATION_UPDATES_PER_USER = 20; // Limit stored updates per user
const DISTANCE_CALCULATION_THROTTLE_MS = 10000; // Throttle distance API calls to every 10s per user
const SESSION_TIMEOUT_HOURS = 2; // Auto-end sessions after 2 hours of inactivity

// In-memory cache for distance calculations to reduce API calls
const distanceCache = new Map<
  string,
  { data: DistanceInfo; timestamp: number }
>();
const lastDistanceCalculation = new Map<string, number>();

/**
 * Calculate distance using Google Distance Matrix API with caching and throttling
 */
async function calculateDistance(
  origin: LocationCoordinates,
  destination: LocationCoordinates,
  cacheKey: string
): Promise<DistanceInfo | null> {
  try {
    // Check cache first (cache for 30 seconds)
    const cached = distanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }

    // Throttle API calls per user
    const lastCall = lastDistanceCalculation.get(cacheKey) || 0;
    if (Date.now() - lastCall < DISTANCE_CALCULATION_THROTTLE_MS) {
      return cached?.data || null; // Return cached or null if too soon
    }

    const apiKey = config.gcs.mapsApiKey;
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
      timeout: 5000, // 5 second timeout
    });

    if (
      response.data.status === "OK" &&
      response.data.rows[0]?.elements[0]?.status === "OK"
    ) {
      const element = response.data.rows[0].elements[0];
      const distanceInfo: DistanceInfo = {
        distance: element.distance.text,
        distanceValue: element.distance.value,
        duration: element.duration.text,
        durationValue: element.duration.value,
      };

      // Cache the result
      distanceCache.set(cacheKey, {
        data: distanceInfo,
        timestamp: Date.now(),
      });
      lastDistanceCalculation.set(cacheKey, Date.now());

      return distanceInfo;
    }

    return null;
  } catch (error) {
    console.error("Error calculating distance:", error);
    return null;
  }
}

/**
 * Get conversation and verify user is participant
 */
async function getAndVerifyConversation(
  conversationId: string,
  userId: string
) {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new AppError("Conversation not found", 404);
  }

  // Verify user is a participant
  if (
    conversation.participant1Id !== userId &&
    conversation.participant2Id !== userId
  ) {
    throw new AppError("Not authorized to access this conversation", 403);
  }

  return conversation;
}

/**
 * Get or create active location sharing session
 */
async function getOrCreateSession(conversationId: string, userId: string) {
  const conversation = await getAndVerifyConversation(conversationId, userId);
  const isParticipant1 = conversation.participant1Id === userId;

  // Check for existing active session
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

  if (existingSession) {
    return { session: existingSession, conversation, isParticipant1 };
  }

  // Create new session
  const [newSession] = await db
    .insert(locationSharingSessionsTable)
    .values({
      conversationId,
      participant1Sharing: false,
      participant2Sharing: false,
      participant1StartedAt: null,
      participant2StartedAt: null,
      participant1StoppedAt: null,
      participant2StoppedAt: null,
      status: "active" as const,
    })
    .returning();

  return { session: newSession, conversation, isParticipant1 };
}

/**
 * Clean up old location updates to prevent database bloat
 */
async function cleanupOldLocationUpdates(sessionId: string) {
  const retentionTime = new Date(
    Date.now() - LOCATION_UPDATE_RETENTION_MINUTES * 60 * 1000
  );

  try {
    await db
      .delete(locationUpdatesTable)
      .where(
        and(
          eq(locationUpdatesTable.sessionId, sessionId),
          gte(locationUpdatesTable.createdAt, retentionTime)
        )
      );
  } catch (error) {
    console.error("Error cleaning up old location updates:", error);
  }
}

/**
 * Start sharing location
 */
export const startLocationSharing = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    const { session, conversation, isParticipant1 } = await getOrCreateSession(
      conversationId,
      userId
    );

    // Check if already sharing
    const alreadySharing = isParticipant1
      ? session.participant1Sharing
      : session.participant2Sharing;

    if (alreadySharing) {
      return res.status(200).json({
        message: "Already sharing location",
        session: {
          ...session,
          participant1Id: conversation.participant1Id,
          participant2Id: conversation.participant2Id,
        },
      });
    }

    // Update session to mark user as sharing
    const updateData = isParticipant1
      ? {
          participant1Sharing: true,
          participant1StartedAt: new Date(),
          participant1StoppedAt: null, // Clear stop time
          updatedAt: new Date(),
        }
      : {
          participant2Sharing: true,
          participant2StartedAt: new Date(),
          participant2StoppedAt: null, // Clear stop time
          updatedAt: new Date(),
        };

    const [updatedSession] = await db
      .update(locationSharingSessionsTable)
      .set(updateData)
      .where(eq(locationSharingSessionsTable.id, session.id))
      .returning();

    // Get the other participant's ID
    const otherUserId =
      userId === conversation.participant1Id
        ? conversation.participant2Id
        : conversation.participant1Id;

    // Emit socket event to other user
    const payload: LocationSharingStartedPayload = {
      conversationId,
      sessionId: updatedSession.id,
      userId,
      timestamp: new Date().toISOString(),
    };

    io.to(otherUserId).emit("location_sharing_started", payload);

    res.status(200).json({
      message: "Location sharing started successfully",
      session: {
        ...updatedSession,
        participant1Id: conversation.participant1Id,
        participant2Id: conversation.participant2Id,
      },
    });
  } catch (error) {
    console.error("Error starting location sharing:", error);
    throw error;
  }
};

/**
 * Stop sharing location
 */
export const stopLocationSharing = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    const conversation = await getAndVerifyConversation(conversationId, userId);
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

    if (!session) {
      return res.status(200).json({
        message: "No active location sharing session",
        session: null,
      });
    }

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
        .set({ status: "ended", updatedAt: new Date() })
        .where(eq(locationSharingSessionsTable.id, session.id));

      // Clean up old location updates
      await cleanupOldLocationUpdates(session.id);

      // Clear distance cache for this session
      distanceCache.delete(`${session.id}:${conversation.participant1Id}`);
      distanceCache.delete(`${session.id}:${conversation.participant2Id}`);
    }

    // Get the other participant's ID
    const otherUserId =
      userId === conversation.participant1Id
        ? conversation.participant2Id
        : conversation.participant1Id;

    // Emit socket event to other user
    const payload: LocationSharingStoppedPayload = {
      conversationId,
      sessionId: session.id,
      userId,
      timestamp: new Date().toISOString(),
    };

    io.to(otherUserId).emit("location_sharing_stopped", payload);

    res.status(200).json({
      message: "Location sharing stopped successfully",
      session: {
        ...updatedSession,
        participant1Id: conversation.participant1Id,
        participant2Id: conversation.participant2Id,
      },
    });
  } catch (error) {
    console.error("Error stopping location sharing:", error);
    throw error;
  }
};

/**
 * Get current location sharing session
 */
export const getLocationSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    const conversation = await getAndVerifyConversation(conversationId, userId);

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

    // Get recent location updates (last LOCATION_UPDATE_RETENTION_MINUTES)
    const retentionTime = new Date(
      Date.now() - LOCATION_UPDATE_RETENTION_MINUTES * 60 * 1000
    );

    const locationUpdates = await db
      .select()
      .from(locationUpdatesTable)
      .where(
        and(
          eq(locationUpdatesTable.sessionId, session.id),
          gte(locationUpdatesTable.createdAt, retentionTime)
        )
      )
      .orderBy(desc(locationUpdatesTable.createdAt))
      .limit(MAX_LOCATION_UPDATES_PER_USER * 2); // Both users

    // Filter to only show updates from users currently sharing
    const filteredUpdates = locationUpdates.filter((update) => {
      const isParticipant1 = update.userId === conversation.participant1Id;
      return isParticipant1
        ? session.participant1Sharing
        : session.participant2Sharing;
    });

    // Add participant IDs to session response
    const sessionWithParticipants = {
      ...session,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
    };

    res.status(200).json({
      session: sessionWithParticipants,
      locationUpdates: filteredUpdates,
    });
  } catch (error) {
    console.error("Error getting location session:", error);
    throw error;
  }
};

/**
 * Handle location update via WebSocket (called from socket handler)
 * This is the primary method for location updates
 */
export const handleLocationUpdate = async (
  userId: string,
  data: UpdateLocationData
) => {
  const { conversationId, latitude, longitude, accuracy } = data;

  try {
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
      throw new Error("No active location sharing session");
    }

    // Get conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Verify user is participant and is sharing
    const isParticipant1 = conversation.participant1Id === userId;
    const isSharing = isParticipant1
      ? session.participant1Sharing
      : session.participant2Sharing;

    if (!isSharing) {
      throw new Error("User is not currently sharing location");
    }

    // Get transaction for meetup coordinates
    let distanceInfo: DistanceInfo | null = null;
    if (conversation.transactionId) {
      const [transaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, conversation.transactionId))
        .limit(1);

      // Calculate distance if meetup coordinates are available
      if (transaction?.meetupCoordinates) {
        const meetupCoords =
          transaction.meetupCoordinates as LocationCoordinates;
        const cacheKey = `${session.id}:${userId}`;

        distanceInfo = await calculateDistance(
          { lat: latitude, lng: longitude },
          meetupCoords,
          cacheKey
        );
      }
    }

    // Create location update
    const [locationUpdate] = await db
      .insert(locationUpdatesTable)
      .values({
        sessionId: session.id,
        userId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        distance: distanceInfo?.distance || null,
      })
      .returning();

    // Cleanup old updates periodically (every 10th update)
    if (Math.random() < 0.1) {
      await cleanupOldLocationUpdates(session.id);
    }

    // Get the other participant's ID
    const otherUserId =
      userId === conversation.participant1Id
        ? conversation.participant2Id
        : conversation.participant1Id;

    // Prepare socket payload
    const payload: LocationUpdatedPayload = {
      conversationId,
      sessionId: session.id,
      userId,
      location: { lat: latitude, lng: longitude },
      distance: distanceInfo?.distance || null,
      duration: distanceInfo?.duration || null,
      timestamp: new Date().toISOString(),
    };

    // Emit to both users (sender for confirmation, other for update)
    io.to(userId).emit("location_updated", payload);
    io.to(otherUserId).emit("location_updated", payload);

    return locationUpdate;
  } catch (error) {
    console.error("Error handling location update:", error);
    throw error;
  }
};

/**
 * Cleanup stale sessions (run periodically via cron job)
 */
export const cleanupStaleSessions = async () => {
  try {
    const staleTime = new Date(
      Date.now() - SESSION_TIMEOUT_HOURS * 60 * 60 * 1000
    );

    // End sessions that haven't been updated in SESSION_TIMEOUT_HOURS
    await db
      .update(locationSharingSessionsTable)
      .set({ status: "ended", updatedAt: new Date() })
      .where(
        and(
          eq(locationSharingSessionsTable.status, "active"),
          gte(locationSharingSessionsTable.updatedAt, staleTime)
        )
      );

    console.log("Cleaned up stale location sharing sessions");
  } catch (error) {
    console.error("Error cleaning up stale sessions:", error);
  }
};

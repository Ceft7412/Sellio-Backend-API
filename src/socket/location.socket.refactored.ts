import { Server, Socket } from "socket.io";
import { handleLocationUpdate } from "../controllers/location.controller.refactored";
import { UpdateLocationData } from "../types/location.types";
import jwt from "jsonwebtoken";
import { config } from "../constants/config";

// Store authenticated user socket mappings
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
const socketUsers = new Map<string, string>(); // socketId -> userId

/**
 * Verify socket authentication token
 */
function verifySocketAuth(token: string): string | null {
  try {
    const jwtSecret = config.jwt.secret;
    if (!jwtSecret) {
      console.error("JWT secret not configured");
      return null;
    }

    const decoded = jwt.verify(token, jwtSecret) as { id: string };
    return decoded.id;
  } catch (error) {
    console.error("Socket auth verification failed:", error);
    return null;
  }
}

/**
 * Setup location sharing socket handlers
 */
export function setupLocationSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    let authenticatedUserId: string | null = null;

    /**
     * Authenticate and join user room
     */
    socket.on("join", (data: { userId: string; token: string }) => {
      try {
        const { userId, token } = data;

        // Verify JWT token
        const verifiedUserId = verifySocketAuth(token);
        if (!verifiedUserId || verifiedUserId !== userId) {
          console.error(
            `[Socket] Authentication failed for user ${userId} on socket ${socket.id}`
          );
          socket.emit("auth_error", {
            message: "Authentication failed",
          });
          socket.disconnect(true);
          return;
        }

        // Store authenticated user
        authenticatedUserId = userId;
        socketUsers.set(socket.id, userId);

        // Add socket to user's set of connections
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        // Join user's personal room
        socket.join(userId);

        console.log(
          `[Socket] User ${userId} authenticated and joined room (socket: ${socket.id})`
        );

        socket.emit("join_success", {
          userId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[Socket] Error in join handler:", error);
        socket.emit("error", { message: "Failed to join" });
      }
    });

    /**
     * Handle location updates via WebSocket
     */
    socket.on("update_location", async (data: UpdateLocationData) => {
      try {
        // Verify user is authenticated
        if (!authenticatedUserId) {
          console.error(
            `[Socket] Unauthenticated location update attempt on socket ${socket.id}`
          );
          socket.emit("auth_error", {
            message: "Not authenticated. Please join first.",
          });
          return;
        }

        // Validate payload
        const { conversationId, latitude, longitude, accuracy } = data;
        if (
          !conversationId ||
          typeof latitude !== "number" ||
          typeof longitude !== "number"
        ) {
          socket.emit("error", {
            message: "Invalid location data",
          });
          return;
        }

        // Validate coordinate ranges
        if (
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          socket.emit("error", {
            message: "Invalid coordinates",
          });
          return;
        }

        // Call controller to handle location update
        await handleLocationUpdate(authenticatedUserId, {
          conversationId,
          latitude,
          longitude,
          accuracy,
        });

        // Acknowledge successful update to sender
        socket.emit("location_update_ack", {
          conversationId,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error("[Socket] Error handling location update:", error);
        socket.emit("location_update_error", {
          message: error.message || "Failed to update location",
        });
      }
    });

    /**
     * Handle manual location sharing start (optional, mainly use REST API)
     */
    socket.on(
      "start_location_sharing",
      (data: { conversationId: string }) => {
        if (!authenticatedUserId) {
          socket.emit("auth_error", {
            message: "Not authenticated",
          });
          return;
        }

        // Emit acknowledgment - actual start is handled via REST API
        socket.emit("location_sharing_start_ack", {
          conversationId: data.conversationId,
          message:
            "Use REST API endpoint to start location sharing for better reliability",
        });
      }
    );

    /**
     * Handle manual location sharing stop (optional, mainly use REST API)
     */
    socket.on("stop_location_sharing", (data: { conversationId: string }) => {
      if (!authenticatedUserId) {
        socket.emit("auth_error", {
          message: "Not authenticated",
        });
        return;
      }

      // Emit acknowledgment - actual stop is handled via REST API
      socket.emit("location_sharing_stop_ack", {
        conversationId: data.conversationId,
        message:
          "Use REST API endpoint to stop location sharing for better reliability",
      });
    });

    /**
     * Handle heartbeat/ping to detect stale connections
     */
    socket.on("ping", () => {
      socket.emit("pong", {
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Handle disconnection
     */
    socket.on("disconnect", (reason) => {
      console.log(
        `[Socket] User disconnected: ${socket.id}, reason: ${reason}`
      );

      // Clean up user socket mappings
      const userId = socketUsers.get(socket.id);
      if (userId) {
        const userSocketSet = userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);

          // If user has no more active sockets, remove from map
          if (userSocketSet.size === 0) {
            userSockets.delete(userId);
            console.log(`[Socket] User ${userId} fully disconnected`);
          }
        }
        socketUsers.delete(socket.id);
      }
    });

    /**
     * Handle errors
     */
    socket.on("error", (error) => {
      console.error(`[Socket] Socket error on ${socket.id}:`, error);
    });
  });

  console.log("[Socket] Location sharing socket handlers initialized");
}

/**
 * Get active socket count for a user
 */
export function getUserSocketCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}

/**
 * Check if user is currently connected
 */
export function isUserConnected(userId: string): boolean {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
}

/**
 * Cleanup - export maps for testing/debugging
 */
export { userSockets, socketUsers };

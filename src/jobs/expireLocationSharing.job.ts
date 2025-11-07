import cron from "node-cron";
import { db } from "../db/connection";
import {
  locationSharingSessionsTable,
  conversationsTable,
} from "../db/schema";
import { eq, and, or, lt } from "drizzle-orm";
import { io } from "../index";

/**
 * Auto-expire location sharing sessions that have been active for 1 hour
 * Runs every 15 minutes
 */
export const expireLocationSharingJob = cron.schedule(
  "*/15 * * * *", // Run every 15 minutes
  async () => {
    console.log("📍 Running location sharing expiration job...");

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Find active sessions where either participant started sharing over 1 hour ago
      const expiredSessions = await db
        .select()
        .from(locationSharingSessionsTable)
        .where(
          and(
            eq(locationSharingSessionsTable.status, "active"),
            or(
              and(
                eq(locationSharingSessionsTable.participant1Sharing, true),
                lt(locationSharingSessionsTable.participant1StartedAt, oneHourAgo)
              ),
              and(
                eq(locationSharingSessionsTable.participant2Sharing, true),
                lt(locationSharingSessionsTable.participant2StartedAt, oneHourAgo)
              )
            )
          )
        );

      if (expiredSessions.length === 0) {
        console.log("✅ No expired location sharing sessions found");
        return;
      }

      console.log(
        `📋 Found ${expiredSessions.length} expired location sharing sessions`
      );

      // Process each expired session
      for (const session of expiredSessions) {
        try {
          const updateData: any = {
            updatedAt: new Date(),
          };

          // Check which participants need to be stopped
          const participant1Expired =
            session.participant1Sharing &&
            session.participant1StartedAt &&
            new Date(session.participant1StartedAt) < oneHourAgo;

          const participant2Expired =
            session.participant2Sharing &&
            session.participant2StartedAt &&
            new Date(session.participant2StartedAt) < oneHourAgo;

          if (participant1Expired) {
            updateData.participant1Sharing = false;
            updateData.participant1StoppedAt = new Date();
          }

          if (participant2Expired) {
            updateData.participant2Sharing = false;
            updateData.participant2StoppedAt = new Date();
          }

          // If both stopped, end the session
          if (
            (!session.participant1Sharing || participant1Expired) &&
            (!session.participant2Sharing || participant2Expired)
          ) {
            updateData.status = "ended";
          }

          // Update the session
          await db
            .update(locationSharingSessionsTable)
            .set(updateData)
            .where(eq(locationSharingSessionsTable.id, session.id));

          // Get conversation details to notify participants
          const [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(eq(conversationsTable.id, session.conversationId))
            .limit(1);

          if (conversation) {
            // Emit socket events to notify participants
            if (participant1Expired) {
              io.to(conversation.participant1Id).emit("location_sharing_expired", {
                conversationId: session.conversationId,
                sessionId: session.id,
              });

              // Notify the other participant that sharing stopped
              io.to(conversation.participant2Id).emit("location_sharing_stopped", {
                conversationId: session.conversationId,
                userId: conversation.participant1Id,
              });
            }

            if (participant2Expired) {
              io.to(conversation.participant2Id).emit("location_sharing_expired", {
                conversationId: session.conversationId,
                sessionId: session.id,
              });

              // Notify the other participant that sharing stopped
              io.to(conversation.participant1Id).emit("location_sharing_stopped", {
                conversationId: session.conversationId,
                userId: conversation.participant2Id,
              });
            }
          }

          console.log(`✅ Expired location sharing session ${session.id}`);
        } catch (error) {
          console.error(
            `❌ Error expiring location session ${session.id}:`,
            error
          );
        }
      }

      console.log(
        `🎉 Location sharing expiration completed: ${expiredSessions.length} sessions processed`
      );
    } catch (error) {
      console.error("❌ Error in location sharing expiration job:", error);
    }
  }
);

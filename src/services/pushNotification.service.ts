import { db } from "../db/connection.js";
import { deviceTokensTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushNotificationData {
  title: string;
  body: string;
  data?: any;
  sound?: string;
  badge?: number;
  channelId?: string;
}

/**
 * Send push notification to a user's devices
 * This is a fire-and-forget function - failures won't break the main flow
 */
export const sendPushNotification = async (
  userId: string,
  notification: PushNotificationData
): Promise<void> => {
  try {
    // Get all active device tokens for the user
    const deviceTokens = await db
      .select()
      .from(deviceTokensTable)
      .where(
        and(
          eq(deviceTokensTable.userId, userId),
          eq(deviceTokensTable.isActive, true)
        )
      );

    if (deviceTokens.length === 0) {
      console.log(`No active device tokens found for user ${userId}`);
      return;
    }

    // Prepare push notification messages
    const messages = deviceTokens.map((device) => ({
      to: device.expoPushToken,
      sound: notification.sound || "default",
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: notification.badge,
      channelId: notification.channelId || "default",
    }));

    // Send push notifications to Expo
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    // Handle Expo push notification errors
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const receipt = result.data[i];
        const deviceToken = deviceTokens[i];

        if (receipt.status === "error") {
          console.error(
            `Push notification error for token ${deviceToken.expoPushToken}:`,
            receipt.message
          );

          // If token is invalid, deactivate it
          if (
            receipt.details?.error === "DeviceNotRegistered" ||
            receipt.message?.includes("not registered")
          ) {
            await db
              .update(deviceTokensTable)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(deviceTokensTable.id, deviceToken.id));

            console.log(
              `Deactivated invalid token: ${deviceToken.expoPushToken}`
            );
          }
        } else if (receipt.status === "ok") {
          console.log(
            `Push notification sent successfully to ${deviceToken.expoPushToken}`
          );
        }
      }
    }
  } catch (error) {
    // Log error but don't throw - push notifications should never break the main flow
    console.error("Error sending push notification:", error);
  }
};

/**
 * Send push notification to multiple users
 */
export const sendBulkPushNotifications = async (
  userIds: string[],
  notification: PushNotificationData
): Promise<void> => {
  // Send notifications in parallel
  await Promise.allSettled(
    userIds.map((userId) => sendPushNotification(userId, notification))
  );
};

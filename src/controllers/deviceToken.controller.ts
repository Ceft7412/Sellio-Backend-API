import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { db } from "../db/connection";
import { deviceTokensTable } from "../db/schema";
import { AppError } from "../middleware/error.middleware";
import { eq, and } from "drizzle-orm";

/**
 * Register or update a device token for push notifications
 */
export const registerDeviceToken = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { expoPushToken, deviceName, deviceType } = req.body;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!expoPushToken) {
      throw new AppError("Expo push token is required", 400);
    }

    // Check if token already exists
    const [existingToken] = await db
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.expoPushToken, expoPushToken))
      .limit(1);

    if (existingToken) {
      // Update existing token
      const [updatedToken] = await db
        .update(deviceTokensTable)
        .set({
          userId, // Update userId in case device changed hands
          deviceName: deviceName || existingToken.deviceName,
          deviceType: deviceType || existingToken.deviceType,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(deviceTokensTable.expoPushToken, expoPushToken))
        .returning();

      return res.json({
        message: "Device token updated successfully",
        token: updatedToken,
      });
    }

    // Create new token
    const [newToken] = await db
      .insert(deviceTokensTable)
      .values({
        userId,
        expoPushToken,
        deviceName: deviceName || null,
        deviceType: deviceType || null,
        isActive: true,
      })
      .returning();

    res.json({
      message: "Device token registered successfully",
      token: newToken,
    });
  } catch (error) {
    console.error("Error registering device token:", error);
    throw error;
  }
};

/**
 * Unregister a device token (when user logs out)
 */
export const unregisterDeviceToken = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { expoPushToken } = req.body;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!expoPushToken) {
      throw new AppError("Expo push token is required", 400);
    }

    // Deactivate the token instead of deleting it
    await db
      .update(deviceTokensTable)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deviceTokensTable.userId, userId),
          eq(deviceTokensTable.expoPushToken, expoPushToken)
        )
      );

    res.json({
      message: "Device token unregistered successfully",
    });
  } catch (error) {
    console.error("Error unregistering device token:", error);
    throw error;
  }
};

/**
 * Get all device tokens for a user (for admin purposes)
 */
export const getUserDeviceTokens = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const tokens = await db
      .select()
      .from(deviceTokensTable)
      .where(
        and(
          eq(deviceTokensTable.userId, userId),
          eq(deviceTokensTable.isActive, true)
        )
      );

    res.json({
      tokens,
    });
  } catch (error) {
    console.error("Error fetching device tokens:", error);
    throw error;
  }
};

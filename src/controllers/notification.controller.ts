import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { db } from "../db/connection";
import { notificationsTable } from "../db/schema";
import { AppError } from "../middleware/error.middleware";
import { eq, and, desc } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";
import { sendPushNotification } from "../services/pushNotification.service";

// ============================================================================
// NOTIFICATION CREATION HELPERS
// ============================================================================

/**
 * Create a notification for a user
 * This is a helper function that can be called from any controller
 */
export const createNotification = async ({
  userId,
  title,
  message,
  imageUrl,
  type = "system",
  routeName,
  routeParams,
  data,
}: {
  userId: string;
  title: string;
  message: string;
  imageUrl: string;
  type?: "user" | "system";
  routeName?: string;
  routeParams?: string;
  data?: any;
}) => {
  try {
    const [notification] = await db
      .insert(notificationsTable)
      .values({
        userId,
        title,
        message,
        image_url: imageUrl,
        type,
        route_name: routeName || null,
        route_params: routeParams || null,
        data: data || null,
        isRead: false,
        status: "active",
      })
      .returning();

    // Send push notification (fire-and-forget)
    sendPushNotification(userId, {
      title,
      body: message,
      data: {
        notificationId: notification.id,
        routeName,
        routeParams,
        ...data,
      },
      sound: "default",
    }).catch((err) => console.error("Failed to send push notification:", err));

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

// ============================================================================
// PREDEFINED NOTIFICATION TEMPLATES
// ============================================================================

/**
 * Notification: New message received
 */
export const notifyNewMessage = async ({
  userId,
  senderName,
  senderAvatar,
  productId,
  conversationId,
  messagePreview,
}: {
  userId: string;
  senderName: string;
  senderAvatar: string;
  productId: string;
  conversationId: string;
  messagePreview: string;
}) => {
  return createNotification({
    userId,
    title: "New Message",
    message: `${senderName}: ${messagePreview}`,
    imageUrl: senderAvatar,
    type: "user",
    routeName: "chat",
    routeParams: JSON.stringify({ conversationId }),
    data: { productId, conversationId, senderName },
  });
};

/**
 * Notification: New bid placed on your product
 */
export const notifyNewBid = async ({
  userId,
  bidderName,
  bidderAvatar,
  productId,
  productTitle,
  bidAmount,
}: {
  userId: string;
  bidderName: string;
  bidderAvatar: string;
  productId: string;
  productTitle: string;
  bidAmount: string;
}) => {
  return createNotification({
    userId,
    title: "New Bid Received",
    message: `${bidderName} placed a bid of ₱${bidAmount} on ${productTitle}`,
    imageUrl: bidderAvatar,
    type: "user",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, bidderName, bidAmount },
  });
};

/**
 * Notification: You've been outbid
 */
export const notifyOutbid = async ({
  userId,
  productId,
  productTitle,
  productImage,
  newBidAmount,
}: {
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  newBidAmount: string;
}) => {
  return createNotification({
    userId,
    title: "You've Been Outbid",
    message: `Someone placed a higher bid of ₱${newBidAmount} on ${productTitle}`,
    imageUrl: productImage,
    type: "system",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, newBidAmount },
  });
};

/**
 * Notification: You won the bid
 */
export const notifyBidWon = async ({
  userId,
  productId,
  productTitle,
  productImage,
  winningBid,
}: {
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  winningBid: string;
}) => {
  return createNotification({
    userId,
    title: "Congratulations! You Won",
    message: `You won the bid for ${productTitle} with ₱${winningBid}`,
    imageUrl: productImage,
    type: "system",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, winningBid },
  });
};

/**
 * Notification: New offer received on your product
 */
export const notifyNewOffer = async ({
  userId,
  buyerName,
  buyerAvatar,
  productId,
  productTitle,
  offerAmount,
}: {
  userId: string;
  buyerName: string;
  buyerAvatar: string;
  productId: string;
  productTitle: string;
  offerAmount: string;
}) => {
  return createNotification({
    userId,
    title: "New Offer Received",
    message: `${buyerName} made an offer of ₱${offerAmount} on ${productTitle}`,
    imageUrl: buyerAvatar,
    type: "user",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, buyerName, offerAmount },
  });
};

/**
 * Notification: Your offer was accepted
 */
export const notifyOfferAccepted = async ({
  userId,
  productId,
  productTitle,
  productImage,
  offerAmount,
}: {
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  offerAmount: string;
}) => {
  return createNotification({
    userId,
    title: "Offer Accepted!",
    message: `Your offer of ₱${offerAmount} for ${productTitle} was accepted`,
    imageUrl: productImage,
    type: "system",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, offerAmount },
  });
};

/**
 * Notification: Your offer was rejected
 */
export const notifyOfferRejected = async ({
  userId,
  productId,
  productTitle,
  productImage,
  offerAmount,
}: {
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  offerAmount: string;
}) => {
  return createNotification({
    userId,
    title: "Offer Declined",
    message: `Your offer of ₱${offerAmount} for ${productTitle} was declined`,
    imageUrl: productImage,
    type: "system",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, offerAmount },
  });
};

/**
 * Notification: Someone wants to buy your product
 */
export const notifyBuyRequest = async ({
  userId,
  buyerName,
  buyerAvatar,
  productId,
  productTitle,
}: {
  userId: string;
  buyerName: string;
  buyerAvatar: string;
  productId: string;
  productTitle: string;
}) => {
  return createNotification({
    userId,
    title: "Buy Request",
    message: `${buyerName} wants to buy ${productTitle}`,
    imageUrl: buyerAvatar,
    type: "user",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, buyerName },
  });
};

/**
 * Notification: New conversation/inquiry about product
 */
export const notifyProductInquiry = async ({
  userId,
  inquirerName,
  inquirerAvatar,
  productId,
  productTitle,
  conversationId,
}: {
  userId: string;
  inquirerName: string;
  inquirerAvatar: string;
  productId: string;
  productTitle: string;
  conversationId: string;
}) => {
  return createNotification({
    userId,
    title: "New Inquiry",
    message: `${inquirerName} is interested in ${productTitle}`,
    imageUrl: inquirerAvatar,
    type: "user",
    routeName: "chat",
    routeParams: JSON.stringify({ conversationId }),
    data: { productId, inquirerName, conversationId },
  });
};

/**
 * Notification: Meetup proposed
 */
export const notifyMeetupProposed = async ({
  userId,
  proposerName,
  proposerAvatar,
  transactionId,
  productTitle,
  meetupLocation,
  meetupTime,
}: {
  userId: string;
  proposerName: string;
  proposerAvatar: string;
  transactionId: string;
  productTitle: string;
  meetupLocation: string;
  meetupTime: string;
}) => {
  return createNotification({
    userId,
    title: "Meetup Proposed",
    message: `${proposerName} proposed a meetup for ${productTitle} at ${meetupLocation}`,
    imageUrl: proposerAvatar,
    type: "user",
    routeName: "myPurchases",
    routeParams: JSON.stringify({ transactionId }),
    data: { transactionId, meetupLocation, meetupTime },
  });
};

/**
 * Notification: Meetup accepted
 */
export const notifyMeetupAccepted = async ({
  userId,
  accepterName,
  accepterAvatar,
  transactionId,
  productTitle,
  meetupLocation,
  meetupTime,
}: {
  userId: string;
  accepterName: string;
  accepterAvatar: string;
  transactionId: string;
  productTitle: string;
  meetupLocation: string;
  meetupTime: string;
}) => {
  return createNotification({
    userId,
    title: "Meetup Confirmed",
    message: `${accepterName} accepted your meetup proposal for ${productTitle}`,
    imageUrl: accepterAvatar,
    type: "user",
    routeName: "myPurchases",
    routeParams: JSON.stringify({ transactionId }),
    data: { transactionId, meetupLocation, meetupTime },
  });
};

/**
 * Notification: Transaction completed
 */
export const notifyTransactionCompleted = async ({
  userId,
  otherUserName,
  otherUserAvatar,
  transactionId,
  productTitle,
}: {
  userId: string;
  otherUserName: string;
  otherUserAvatar: string;
  transactionId: string;
  productTitle: string;
}) => {
  return createNotification({
    userId,
    title: "Transaction Completed",
    message: `Transaction for ${productTitle} has been completed. Leave a review!`,
    imageUrl: otherUserAvatar,
    type: "system",
    routeName: "review",
    routeParams: JSON.stringify({ transactionId }),
    data: { transactionId, productTitle },
  });
};

/**
 * Notification: New review received
 */
export const notifyNewReview = async ({
  userId,
  reviewerName,
  reviewerAvatar,
  rating,
  productTitle,
}: {
  userId: string;
  reviewerName: string;
  reviewerAvatar: string;
  rating: number;
  productTitle: string;
}) => {
  const stars = "⭐".repeat(Math.floor(rating));
  return createNotification({
    userId,
    title: "New Review",
    message: `${reviewerName} left you a ${stars} review for ${productTitle}`,
    imageUrl: reviewerAvatar,
    type: "user",
    routeName: "userProfile",
    routeParams: JSON.stringify({ userId }),
    data: { rating, productTitle },
  });
};

/**
 * Notification: Product sold
 */
export const notifyProductSold = async ({
  userId,
  buyerName,
  buyerAvatar,
  productId,
  productTitle,
  soldPrice,
}: {
  userId: string;
  buyerName: string;
  buyerAvatar: string;
  productId: string;
  productTitle: string;
  soldPrice: string;
}) => {
  return createNotification({
    userId,
    title: "Product Sold!",
    message: `${productTitle} was sold to ${buyerName} for ₱${soldPrice}`,
    imageUrl: buyerAvatar,
    type: "system",
    routeName: "myListings",
    routeParams: JSON.stringify({ productId }),
    data: { productId, buyerName, soldPrice },
  });
};

/**
 * Notification: Transaction cancelled
 */
export const notifyTransactionCancelled = async ({
  userId,
  cancellerName,
  cancellerAvatar,
  transactionId,
  productTitle,
  reason,
}: {
  userId: string;
  cancellerName: string;
  cancellerAvatar: string;
  transactionId: string;
  productTitle: string;
  reason: string;
}) => {
  return createNotification({
    userId,
    title: "Transaction Cancelled",
    message: `${cancellerName} cancelled the transaction for ${productTitle}. Reason: ${reason}`,
    imageUrl: cancellerAvatar,
    type: "system",
    routeName: "myPurchases",
    routeParams: JSON.stringify({ transactionId }),
    data: { transactionId, reason },
  });
};

/**
 * Notification: Bidding ending soon
 */
export const notifyBiddingEndingSoon = async ({
  userId,
  productId,
  productTitle,
  productImage,
  hoursRemaining,
}: {
  userId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  hoursRemaining: number;
}) => {
  return createNotification({
    userId,
    title: "Bidding Ending Soon",
    message: `Bidding for ${productTitle} ends in ${hoursRemaining} hours`,
    imageUrl: productImage,
    type: "system",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, hoursRemaining },
  });
};

/**
 * Notification: Product favorited/liked
 */
export const notifyProductFavorited = async ({
  userId,
  likerName,
  likerAvatar,
  productId,
  productTitle,
}: {
  userId: string;
  likerName: string;
  likerAvatar: string;
  productId: string;
  productTitle: string;
}) => {
  return createNotification({
    userId,
    title: "Product Liked",
    message: `${likerName} liked your product ${productTitle}`,
    imageUrl: likerAvatar,
    type: "user",
    routeName: "productDetail",
    routeParams: JSON.stringify({ productId }),
    data: { productId, likerName },
  });
};

// ============================================================================
// NOTIFICATION RETRIEVAL ENDPOINTS
// ============================================================================

/**
 * Get all notifications for the authenticated user
 */
export const getUserNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.status, "active")
        )
      )
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50); // Limit to last 50 notifications

    // Format notifications with relative timestamps
    const formattedNotifications = notifications.map((notification) => {
      const createdAt = new Date(notification.createdAt);
      const timezoneOffset = createdAt.getTimezoneOffset() * 60000; // in milliseconds
      const correctedDate = new Date(createdAt.getTime() + timezoneOffset);

      return {
        ...notification,
        timestamp: formatDistanceToNow(correctedDate, {
          addSuffix: true,
        }),
      };
    });

    // Count unread notifications
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      notifications: formattedNotifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    throw error;
  }
};

/**
 * Mark a notification as read
 */
export const markNotificationAsRead = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    // Update notification
    const [notification] = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, userId)
        )
      )
      .returning();

    if (!notification) {
      throw new AppError("Notification not found", 404);
    }

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false)
        )
      );

    res.json({
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const [deletedNotification] = await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, userId)
        )
      )
      .returning();

    if (!deletedNotification) {
      throw new AppError("Notification not found", 404);
    }

    res.json({
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const unreadNotifications = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false)
        )
      );

    res.json({
      unreadCount: unreadNotifications.length,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    throw error;
  }
};

/**
 * Archive all notifications for the authenticated user
 */
export const archiveAllNotifications = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    await db
      .update(notificationsTable)
      .set({ status: "archived" })
      .where(eq(notificationsTable.userId, userId));

    res.json({
      message: "All notifications archived successfully",
    });
  } catch (error) {
    console.error("Error archiving all notifications:", error);
    throw error;
  }
};

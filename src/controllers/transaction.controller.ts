import { Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  transactions,
  messagesTable,
  conversationsTable,
  productsTable,
  offersTable,
  buysTable,
  bidsTable,
  usersTable,
  productImagesTable,
  reviews,
  reviewImages,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { eq, desc, inArray, and } from "drizzle-orm";
import { io } from "../index";
import {
  uploadToGCS,
  generateUniqueFileName,
} from "../services/storage.service";
import {
  notifyMeetupProposed,
  notifyMeetupAccepted,
  notifyTransactionCompleted,
  notifyTransactionCancelled,
  notifyProductSold,
} from "./notification.controller";
import { registerReviewToBlockchain } from "../blockchain/reviewRegistry";
import { registerTransactionToBlockchain } from "../blockchain/transactionRegistry";

const generateReferenceNumber = () => {
  const min = 100000000000; // 12 digits
  const max = 999999999999;
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
};

// Propose meetup time and location
export const proposeMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;
    const { scheduledMeetupAt, meetupLocation, meetupCoordinates } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);
    if (!scheduledMeetupAt) throw new AppError("Meetup time is required", 400);
    if (!meetupLocation) throw new AppError("Meetup location is required", 400);
    if (!meetupCoordinates)
      throw new AppError("Meetup coordinates are required", 400);

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    // Verify user is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("Unauthorized access to transaction", 403);
    }

    // Check if transaction is active
    if (transaction.status !== "active") {
      throw new AppError(
        `Cannot propose meetup for ${transaction.status} transaction`,
        400
      );
    }

    // Validate meetup time is in the future
    const meetupDate = new Date(scheduledMeetupAt);
    if (meetupDate <= new Date()) {
      throw new AppError("Meetup time must be in the future", 400);
    }

    // Update transaction with meetup details
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        scheduledMeetupAt: meetupDate,
        meetupLocation,
        meetupCoordinates,
        meetupStatus: "scheduled",
        meetupProposedBy: userId,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Find conversation for this transaction
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.transactionId, transactionId))
      .limit(1);

    if (conversation) {
      // Format date and time for message
      const formattedDate = meetupDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const formattedTime = meetupDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // Create automatic message
      const messageContent = `I proposed a meetup:\n ${formattedDate}\n ${formattedTime}\n ${meetupLocation}`;

      const [newMessage] = await db
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          senderId: userId,
          content: messageContent,
          isRead: false,
        })
        .returning();

      // Get the other participant
      const otherUserId =
        transaction.buyerId === userId
          ? transaction.sellerId
          : transaction.buyerId;

      // Emit socket events to the other user
      io.to(otherUserId).emit("meetup_proposed", {
        transactionId: transaction.id,
        conversationId: conversation.id,
        scheduledMeetupAt: meetupDate,
        meetupLocation,
        meetupCoordinates,
      });

      io.to(otherUserId).emit("new_message", {
        conversationId: conversation.id,
        message: newMessage,
      });
    }

    // Send notification to the other user
    const otherUserId =
      transaction.buyerId === userId
        ? transaction.sellerId
        : transaction.buyerId;

    // Get proposer and product info for notification
    const [proposer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, transaction.productId))
      .limit(1);

    if (proposer && product) {
      notifyMeetupProposed({
        userId: otherUserId,
        proposerName: proposer.displayName || "Someone",
        proposerAvatar: proposer.avatarUrl || "",
        transactionId: transaction.id,
        productTitle: product.title,
        meetupLocation,
        meetupTime: scheduledMeetupAt,
      }).catch((err) =>
        console.error("Failed to send meetup proposed notification:", err)
      );
    }

    res.status(200).json({
      message: "Meetup proposed successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error("Error proposing meetup:", error);
    throw error;
  }
};

// Accept meetup proposal
export const acceptMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    // Verify user is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("Unauthorized access to transaction", 403);
    }

    // Check if meetup is scheduled
    if (transaction.meetupStatus !== "scheduled") {
      throw new AppError("No meetup proposal to accept", 400);
    }

    // Update transaction meetup status to confirmed (both agreed)
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        meetupStatus: "confirmed",
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Find conversation for this transaction
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.transactionId, transactionId))
      .limit(1);

    if (conversation) {
      // Create automatic message
      const messageContent = `I accepted the meetup proposal.`;

      const [newMessage] = await db
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          senderId: userId,
          content: messageContent,
          isRead: false,
        })
        .returning();

      // Get the other participant
      const otherUserId =
        transaction.buyerId === userId
          ? transaction.sellerId
          : transaction.buyerId;

      // Emit socket events to the other user
      io.to(otherUserId).emit("meetup_accepted", {
        transactionId: transaction.id,
        conversationId: conversation.id,
      });

      io.to(otherUserId).emit("new_message", {
        conversationId: conversation.id,
        message: newMessage,
      });
    }

    // Send notification to the other user
    const otherUserId =
      transaction.buyerId === userId
        ? transaction.sellerId
        : transaction.buyerId;

    // Get accepter and product info for notification
    const [accepter] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, transaction.productId))
      .limit(1);

    if (
      accepter &&
      product &&
      transaction.scheduledMeetupAt &&
      transaction.meetupLocation
    ) {
      notifyMeetupAccepted({
        userId: otherUserId,
        accepterName: accepter.displayName || "Someone",
        accepterAvatar: accepter.avatarUrl || "",
        transactionId: transaction.id,
        productTitle: product.title,
        meetupLocation: transaction.meetupLocation,
        meetupTime: transaction.scheduledMeetupAt.toISOString(),
      }).catch((err) =>
        console.error("Failed to send meetup accepted notification:", err)
      );
    }

    res.status(200).json({
      message: "Meetup accepted successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error("Error accepting meetup:", error);
    throw error;
  }
};

export const markAsSold = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) throw new AppError("Transaction not found", 404);

    // Verify user is the seller
    if (transaction.sellerId !== userId) {
      throw new AppError(
        "Only the seller can mark the transaction as sold",
        403
      );
    }

    // Check if transaction is confirmed
    if (transaction.meetupStatus !== "confirmed") {
      throw new AppError(
        "Transaction must have a confirmed meetup before marking as sold",
        400
      );
    }

    // Check if transaction is active
    if (transaction.status !== "active") {
      throw new AppError(
        `Cannot mark ${transaction.status} transaction as sold`,
        400
      );
    }

    // Generate reference number
    const referenceNumber = generateReferenceNumber();

    // Update transaction status to completed
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        status: "completed",
        completedAt: new Date(),
        sellerConfirmedCompletion: true,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        reference_number: referenceNumber,
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Update product status to sold
    await db
      .update(productsTable)
      .set({
        status: "sold",
        soldAt: new Date(),
        soldTo: transaction.buyerId,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, transaction.productId));

    // Update offer status to completed if this transaction has an offer
    if (transaction.offerId) {
      await db
        .update(offersTable)
        .set({
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(offersTable.id, transaction.offerId));
    }

    // Update buy status to completed if this transaction has a buy
    if (transaction.buyId) {
      await db
        .update(buysTable)
        .set({
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(buysTable.id, transaction.buyId));
    }

    // Update bid status to completed if this transaction has a bid
    if (transaction.bidId) {
      await db
        .update(bidsTable)
        .set({
          status: "completed",
        })
        .where(eq(bidsTable.id, transaction.bidId));
    }

    // Find conversation for this transaction
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.transactionId, transactionId))
      .limit(1);

    // Send notifications to both buyer and seller
    const [seller] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, transaction.sellerId))
      .limit(1);

    const [buyer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, transaction.buyerId))
      .limit(1);

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, transaction.productId))
      .limit(1);

    if (seller && buyer && product) {
      // Register transaction to blockchain (fire-and-forget)
      registerTransactionToBlockchain(
        updatedTransaction.id,
        updatedTransaction.productId,
        buyer?.displayName ?? "Anonymous",
        seller?.displayName ?? "Anonymous",
        updatedTransaction.agreedPrice,
        updatedTransaction.meetupLocation ?? "",
        updatedTransaction.scheduledMeetupAt?.toISOString() ?? "",
        updatedTransaction.createdAt.toISOString(),
        updatedTransaction.status
      ).catch((error) => {
        console.error("Error registering transaction to blockchain:", error);
      });

      const completionData = {
        buyerName: buyer.displayName,
        sellerName: seller.displayName,
        productName: product.title,
        meetupLocation: updatedTransaction.meetupLocation,
        completedAt: updatedTransaction.completedAt,
        referenceNumber: updatedTransaction.reference_number,
        blockchainTxHash: updatedTransaction.blockchainTxHash,
        totalPrice: updatedTransaction.agreedPrice,
      };

      if (conversation) {
        // Create automatic message
        const messageContent = `The transaction has been marked as sold and completed.`;

        const [newMessage] = await db
          .insert(messagesTable)
          .values({
            conversationId: conversation.id,
            senderId: userId,
            content: messageContent,
            isRead: false,
          })
          .returning();

        // Emit socket events to buyer
        io.to(transaction.buyerId).emit("transaction_completed", {
          transactionId: transaction.id,
          conversationId: conversation.id,
          completionData: completionData,
        });

        io.to(transaction.sellerId).emit("transaction_completed", {
          transactionId: transaction.id,
          conversationId: conversation.id,
          completionData: completionData,
        });

        io.to(transaction.buyerId).emit("new_message", {
          conversationId: conversation.id,
          message: newMessage,
        });
      }

      // Notify buyer about completion (review prompt)
      notifyTransactionCompleted({
        userId: transaction.buyerId,
        otherUserName: seller.displayName || "Seller",
        otherUserAvatar: seller.avatarUrl || "",
        transactionId: transaction.id,
        productTitle: product.title,
      }).catch((err) =>
        console.error(
          "Failed to send transaction completed notification to buyer:",
          err
        )
      );

      // Notify seller about product sold and completion
      notifyProductSold({
        userId: transaction.sellerId,
        buyerName: buyer.displayName || "Buyer",
        buyerAvatar: buyer.avatarUrl || "",
        productId: product.id,
        productTitle: product.title,
        soldPrice: product.price,
      }).catch((err) =>
        console.error("Failed to send product sold notification:", err)
      );

      // Also notify seller about completion (review prompt)
      notifyTransactionCompleted({
        userId: transaction.sellerId,
        otherUserName: buyer.displayName || "Buyer",
        otherUserAvatar: buyer.avatarUrl || "",
        transactionId: transaction.id,
        productTitle: product.title,
      }).catch((err) =>
        console.error(
          "Failed to send transaction completed notification to seller:",
          err
        )
      );

      res.status(200).json({
        message: "Transaction marked as sold successfully",
        transaction: updatedTransaction,
        completionData: completionData,
      });
    } else {
      res.status(200).json({
        message: "Transaction marked as sold successfully",
        transaction: updatedTransaction,
      });
    }
  } catch (error) {
    console.error("Error marking transaction as sold:", error);
    throw error;
  }
};
// Cancel transaction
export const cancelTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;
    const { reason, customReason } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);
    if (!reason) throw new AppError("Cancellation reason is required", 400);

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) throw new AppError("Transaction not found", 404);

    // Verify user is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("Unauthorized access to transaction", 403);
    }

    // Check if transaction can be cancelled
    if (transaction.status !== "active") {
      throw new AppError(
        `Cannot cancel ${transaction.status} transaction`,
        400
      );
    }

    // Check if meetup is scheduled and within 1 hour
    if (transaction.scheduledMeetupAt) {
      const meetupTime = new Date(transaction.scheduledMeetupAt);
      const now = new Date();
      const oneHourBeforeMeetup = new Date(
        meetupTime.getTime() - 60 * 60 * 1000
      );

      if (now >= oneHourBeforeMeetup) {
        throw new AppError(
          "Cannot cancel transaction within 1 hour of scheduled meetup",
          400
        );
      }
    }

    // Determine who cancelled
    const isBuyer = transaction.buyerId === userId;
    const cancelledByRole = isBuyer ? "buyer" : "seller";
    const newStatus = isBuyer ? "cancelled_by_buyer" : "cancelled_by_seller";

    // Build cancellation reason message
    const reasonText =
      reason === "other" ? customReason : reason.replace(/_/g, " ");

    // Update transaction status
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        status: newStatus,
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: reasonText,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Update related records based on transaction type
    if (transaction.offerId) {
      await db
        .update(offersTable)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(offersTable.id, transaction.offerId));
    }

    if (transaction.buyId) {
      await db
        .update(buysTable)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(buysTable.id, transaction.buyId));
    }

    if (transaction.bidId) {
      await db
        .update(bidsTable)
        .set({
          status: "cancelled",
        })
        .where(eq(bidsTable.id, transaction.bidId));
    }

    // Update product status back to active
    await db
      .update(productsTable)
      .set({
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, transaction.productId));

    // Find conversation for this transaction
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.transactionId, transactionId))
      .limit(1);

    if (conversation) {
      // Get the other participant
      const otherUserId = isBuyer ? transaction.sellerId : transaction.buyerId;

      const cancellationPayload = {
        transactionId: transaction.id,
        conversationId: conversation.id,
        cancelledBy: cancelledByRole,
        reason: reasonText,
      };

      // Emit socket events to both users for real-time updates
      io.to(otherUserId).emit("transaction_cancelled", cancellationPayload);
      io.to(userId).emit("transaction_cancelled", cancellationPayload);

      console.log(`🚫 Transaction cancelled by ${cancelledByRole}:`, {
        transactionId: transaction.id,
        conversationId: conversation.id,
        reason: reasonText,
      });
    }

    // Send notification to the other user
    const otherUserId = isBuyer ? transaction.sellerId : transaction.buyerId;

    // Get canceller and product info for notification
    const [canceller] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, transaction.productId))
      .limit(1);

    if (canceller && product) {
      notifyTransactionCancelled({
        userId: otherUserId,
        cancellerName: canceller.displayName || "Someone",
        cancellerAvatar: canceller.avatarUrl || "",
        transactionId: transaction.id,
        productTitle: product.title,
        reason: reasonText,
      }).catch((err) =>
        console.error("Failed to send transaction cancelled notification:", err)
      );
    }

    res.status(200).json({
      message: "Transaction cancelled successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error("Error cancelling transaction:", error);
    throw error;
  }
};

// Get user's purchases (transactions where user is the buyer)
export const getMyPurchases = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) throw new AppError("User not authenticated", 401);

    // Get buyer info
    const [buyer] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    // Get all transactions where user is the buyer
    const userTransactions = await db
      .select()
      .from(transactions)
      .innerJoin(productsTable, eq(transactions.productId, productsTable.id))
      .innerJoin(usersTable, eq(transactions.sellerId, usersTable.id))
      .where(eq(transactions.buyerId, userId))
      .orderBy(desc(transactions.createdAt));

    // Get product images for all products
    const productIds = userTransactions.map((row) => row.products.id);

    // Fetch all product images at once
    const allProductImages =
      productIds.length > 0
        ? await db
            .select()
            .from(productImagesTable)
            .where(inArray(productImagesTable.productId, productIds))
        : [];

    // Group images by product ID
    const imagesByProduct = allProductImages.reduce((acc: any, img: any) => {
      if (!acc[img.productId]) acc[img.productId] = [];
      acc[img.productId].push(img);
      return acc;
    }, {});

    // Format the response
    const formattedPurchases = userTransactions.map((row) => {
      const images = imagesByProduct[row.products.id] || [];
      const coverImage =
        images.find((img: any) => img.isPrimary)?.imageUrl ||
        images[0]?.imageUrl ||
        null;

      const completionData = {
        buyerName: buyer?.displayName,
        sellerName: row.users.displayName,
        productName: row.products.title,
        meetupLocation: row.transactions.meetupLocation,
        completedAt: row.transactions.completedAt,
        referenceNumber: row.transactions.reference_number,
        blockchainTxHash: row.transactions.blockchainTxHash,
        totalPrice: row.transactions.agreedPrice,
      };

      return {
        transaction: row.transactions,
        product: {
          ...row.products,
          coverImage,
        },
        seller: {
          id: row.users.id,
          displayName: row.users.displayName,
          avatarUrl: row.users.avatarUrl,
          verified: row.users.identityVerified,
        },
        completionData: completionData,
      };
    });

    res.status(200).json({
      message: "Purchases retrieved successfully",
      purchases: formattedPurchases,
    });
  } catch (error) {
    console.error("Error getting user purchases:", error);
    throw error;
  }
};

// Get user's sales (transactions where user is the seller)
export const getMySales = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) throw new AppError("User not authenticated", 401);

    // Get seller info
    const [seller] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    // Get all transactions where user is the seller
    const userTransactions = await db
      .select()
      .from(transactions)
      .innerJoin(productsTable, eq(transactions.productId, productsTable.id))
      .innerJoin(usersTable, eq(transactions.buyerId, usersTable.id))
      .where(eq(transactions.sellerId, userId))
      .orderBy(desc(transactions.createdAt));

    // Get product images for all products
    const productIds = userTransactions.map((row) => row.products.id);

    // Fetch all product images at once
    const allProductImages =
      productIds.length > 0
        ? await db
            .select()
            .from(productImagesTable)
            .where(inArray(productImagesTable.productId, productIds))
        : [];

    // Group images by product ID
    const imagesByProduct = allProductImages.reduce((acc: any, img: any) => {
      if (!acc[img.productId]) acc[img.productId] = [];
      acc[img.productId].push(img);
      return acc;
    }, {});

    // Format the response
    const formattedSales = userTransactions.map((row) => {
      const images = imagesByProduct[row.products.id] || [];
      const coverImage =
        images.find((img: any) => img.isPrimary)?.imageUrl ||
        images[0]?.imageUrl ||
        null;

      const completionData = {
        buyerName: row.users.displayName,
        sellerName: seller?.displayName,
        productName: row.products.title,
        meetupLocation: row.transactions.meetupLocation,
        completedAt: row.transactions.completedAt,
        referenceNumber: row.transactions.reference_number,
        blockchainTxHash: row.transactions.blockchainTxHash,
        totalPrice: row.transactions.agreedPrice,
      };

      return {
        transaction: row.transactions,
        product: {
          ...row.products,
          coverImage,
        },
        buyer: {
          id: row.users.id,
          displayName: row.users.displayName,
          avatarUrl: row.users.avatarUrl,
          verified: row.users.identityVerified,
        },
        completionData: completionData,
      };
    });

    res.status(200).json({
      message: "Sales retrieved successfully",
      sales: formattedSales,
    });
  } catch (error) {
    console.error("Error getting user sales:", error);
    throw error;
  }
};

// Check if user has already reviewed for a transaction
export const checkReviewExists = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    // Verify user is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("Unauthorized access to transaction", 403);
    }

    // Check if user has already left a review for this transaction
    const [existingReview] = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.transactionId, transactionId),
          eq(reviews.reviewerId, userId)
        )
      )
      .limit(1);

    res.status(200).json({
      hasReviewed: !!existingReview,
      review: existingReview || null,
    });
  } catch (error) {
    console.error("Error checking review exists:", error);
    throw error;
  }
};

// Create a review for a completed transaction
export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { transactionId } = req.params;
    const { rating, reviewText, isAnonymous } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);
    if (!rating) throw new AppError("Rating is required", 400);
    if (!reviewText) throw new AppError("Review text is required", 400);

    // Validate rating is between 1 and 5
    const numRating = parseFloat(rating);
    if (numRating < 1 || numRating > 5) {
      throw new AppError("Rating must be between 1 and 5", 400);
    }

    // Get transaction details
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    // Verify transaction is completed
    if (transaction.status !== "completed") {
      throw new AppError("Can only review completed transactions", 400);
    }

    // Verify user is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("Unauthorized access to transaction", 403);
    }

    // Check if user has already left a review for this transaction
    const [existingReview] = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.transactionId, transactionId),
          eq(reviews.reviewerId, userId)
        )
      )
      .limit(1);

    if (existingReview) {
      throw new AppError("You have already reviewed this transaction", 400);
    }

    // Determine reviewer and reviewee roles
    const isBuyer = transaction.buyerId === userId;
    const reviewerRole = isBuyer ? "buyer" : "seller";
    const revieweeRole = isBuyer ? "seller" : "buyer";
    const revieweeId = isBuyer ? transaction.sellerId : transaction.buyerId;

    // Create the review
    const [newReview] = await db
      .insert(reviews)
      .values({
        transactionId,
        reviewerId: userId,
        revieweeId,
        rating: numRating.toString(),
        reviewText,
        reviewerRole,
        revieweeRole,
        isAnonymous: isAnonymous || false,
        isVerifiedTransaction: true,
      })
      .returning();

    // Get reviewer and reviewee names for blockchain
    const [reviewer] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const [reviewee] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, revieweeId));

    // Register review to blockchain (fire-and-forget)
    registerReviewToBlockchain(
      newReview.id,
      reviewer?.displayName ?? "Anonymous",
      reviewee?.displayName ?? "Anonymous",
      transactionId,
      newReview.reviewText,
      newReview.rating,
      newReview.createdAt.toISOString()
    ).catch((error) => {
      console.error("Error registering review to blockchain:", error);
    });

    // Handle image uploads if any
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      const uploadPromises = files.map(async (file, index) => {
        const fileName = generateUniqueFileName(file.originalname);
        const gcsUrl = await uploadToGCS(file.buffer, fileName, file.mimetype);

        return db.insert(reviewImages).values({
          reviewId: newReview.id,
          gcsUrl,
          sortOrder: index,
        });
      });

      await Promise.all(uploadPromises);
    }

    // Get the review with images
    const reviewWithImages = await db
      .select()
      .from(reviews)
      .leftJoin(reviewImages, eq(reviews.id, reviewImages.reviewId))
      .where(eq(reviews.id, newReview.id));

    res.status(201).json({
      message: "Review created successfully",
      review: newReview,
      images: reviewWithImages
        .filter((r) => r.review_images)
        .map((r) => r.review_images),
    });
  } catch (error) {
    console.error("Error creating review:", error);
    throw error;
  }
};

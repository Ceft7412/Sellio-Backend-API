import { Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  transactions,
  messagesTable,
  conversationsTable,
  productsTable,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { eq } from "drizzle-orm";
import { io } from "../index";

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

    // Update transaction status to completed
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        status: "completed",
        completedAt: new Date(),
        sellerConfirmedCompletion: true,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
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

    // Find conversation for this transaction
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.transactionId, transactionId))
      .limit(1);

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
      });

      io.to(transaction.buyerId).emit("new_message", {
        conversationId: conversation.id,
        message: newMessage,
      });
    }

    res.status(200).json({
      message: "Transaction marked as sold successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error("Error marking transaction as sold:", error);
    throw error;
  }
};

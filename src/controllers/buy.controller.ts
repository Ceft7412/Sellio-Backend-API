import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { db } from "../db/connection.js";
import {
  buysTable,
  productsTable,
  transactions,
  conversationsTable,
  messagesTable,
  usersTable,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { io } from "../index.js";
import { notifyBuyRequest } from "./notification.controller.js";

/**
 * Confirm a buy request (seller only)
 */
export const confirmBuy = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Get buy details
  const [buy] = await db
    .select()
    .from(buysTable)
    .where(eq(buysTable.id, id))
    .limit(1);

  if (!buy) {
    throw new AppError("Buy request not found", 404);
  }

  if (buy.sellerId !== userId) {
    throw new AppError("Not authorized to confirm this purchase", 403);
  }

  if (buy.status !== "pending") {
    throw new AppError("Buy request is not pending", 400);
  }

  // Get product details for transaction
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, buy.productId))
    .limit(1);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (product.status !== "active") {
    throw new AppError("Product is not available", 400);
  }

  // Update buy status
  const [updatedBuy] = await db
    .update(buysTable)
    .set({
      status: "confirmed_pending_meetup",
      updatedAt: new Date(),
    })
    .where(eq(buysTable.id, id))
    .returning();

  // Create transaction record with 24-hour expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const [transaction] = await db
    .insert(transactions)
    .values({
      buyId: buy.id,
      productId: buy.productId,
      buyerId: buy.buyerId,
      sellerId: buy.sellerId,
      agreedPrice: buy.purchasePrice,
      originalPrice: product.price,
      status: "active",
      meetupStatus: "not_scheduled",
      expiresAt: expiresAt,
    })
    .returning();

  // Find the conversation with this buy and update with transactionId
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.buyId, id))
    .limit(1);

  if (conversation) {
    // Update conversation with transactionId
    await db
      .update(conversationsTable)
      .set({
        transactionId: transaction.id,
      })
      .where(eq(conversationsTable.id, conversation.id));

    // Create automatic message
    const messageContent = `Purchase confirmed! The buy now price of ₱${parseFloat(
      buy.purchasePrice
    ).toLocaleString()} has been accepted. Please schedule a meetup to complete the transaction.`;

    const [newMessage] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        content: messageContent,
        isRead: false,
      })
      .returning();

    // Emit socket events
    io.to(buy.buyerId).emit("buy_confirmed", {
      buyId: buy.id,
      conversationId: conversation.id,
      transactionId: transaction.id,
    });

    io.to(buy.buyerId).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });

    io.to(buy.sellerId).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });
  }

  res.status(200).json({
    message: "Purchase confirmed successfully",
    buy: updatedBuy,
    transaction,
  });
};

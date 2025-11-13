import { Request, Response } from "express";
import { db } from "../db/connection.js";
import {
  offersTable,
  productsTable,
  messagesTable,
  conversationsTable,
  transactions,
  usersTable,
  productImagesTable,
} from "../db/schema.js";
import { eq, and, or } from "drizzle-orm";
import { AppError } from "../middleware/error.middleware.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { io } from "../index.js";
import {
  notifyNewOffer,
  notifyOfferAccepted,
  notifyOfferRejected,
} from "./notification.controller.js";

// Create an offer
export const createOffer = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const { productId, offerAmount, message, expiresAt } = req.body;

  if (!productId || !offerAmount) {
    throw new AppError("Product ID and offer amount are required", 400);
  }

  // Get product details
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (product.sellerId === userId) {
    throw new AppError("Cannot make offer on your own product", 400);
  }

  if (!product.allowOffers) {
    throw new AppError("This product does not accept offers", 400);
  }

  if (product.status !== "active") {
    throw new AppError("Product is not available for offers", 400);
  }

  // Create offer
  const [newOffer] = await db
    .insert(offersTable)
    .values({
      productId,
      buyerId: userId,
      sellerId: product.sellerId,
      offerAmount,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      status: "pending",
    })
    .returning();

  // Get buyer info for notification
  const [buyer] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Notify seller about new offer
  if (buyer) {
    notifyNewOffer({
      userId: product.sellerId,
      buyerName: buyer.displayName || "Anonymous",
      buyerAvatar: buyer.avatarUrl || "",
      productId: productId,
      productTitle: product.title,
      offerAmount: offerAmount,
    }).catch((err) =>
      console.error("Failed to send new offer notification:", err)
    );
  }

  res.status(201).json({
    message: "Offer created successfully",
    offer: newOffer,
  });
};

// Get offers for a product (seller view)
export const getProductOffers = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { productId } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Verify user owns the product
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (product.sellerId !== userId) {
    throw new AppError("Not authorized to view offers for this product", 403);
  }

  const offers = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.productId, productId));

  res.json({
    offers,
    count: offers.length,
  });
};

// Get user's offers (buyer view)
export const getUserOffers = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const offers = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.buyerId, userId));

  res.json({
    offers,
    count: offers.length,
  });
};

// Accept an offer
export const acceptOffer = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Get offer details
  const [offer] = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.id, id))
    .limit(1);

  if (!offer) {
    throw new AppError("Offer not found", 404);
  }

  if (offer.sellerId !== userId) {
    throw new AppError("Not authorized to accept this offer", 403);
  }

  if (offer.status !== "pending") {
    throw new AppError("Offer is not pending", 400);
  }

  // Get product details for transaction
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, offer.productId))
    .limit(1);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  // Update offer status
  const [updatedOffer] = await db
    .update(offersTable)
    .set({
      status: "accepted",
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(offersTable.id, id))
    .returning();

  // Create transaction record with 24-hour expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const [transaction] = await db
    .insert(transactions)
    .values({
      offerId: offer.id,
      productId: offer.productId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      agreedPrice: offer.offerAmount,
      originalPrice: product.price,
      status: "active",
      meetupStatus: "not_scheduled",
      expiresAt: expiresAt,
    })
    .returning();

  // Find the conversation with this offer and update with transactionId
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.offerId, id))
    .limit(1);

  if (conversation) {
    // Update conversation with transactionId
    await db
      .update(conversationsTable)
      .set({
        transactionId: transaction.id,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversation.id));

    // Create automatic message
    const messageContent = `I accept your offer of ₱${parseFloat(
      offer.offerAmount
    ).toLocaleString()}.`;

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
    io.to(offer.buyerId).emit("offer_accepted", {
      offerId: offer.id,
      conversationId: conversation.id,
      offerAmount: offer.offerAmount,
      transactionId: transaction.id,
    });

    io.to(offer.buyerId).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });
  }

  // Get product image for notification
  const [productImage] = await db
    .select()
    .from(productImagesTable)
    .where(
      and(
        eq(productImagesTable.productId, offer.productId),
        eq(productImagesTable.isPrimary, true)
      )
    )
    .limit(1);

  // Notify buyer that offer was accepted
  notifyOfferAccepted({
    userId: offer.buyerId,
    productId: offer.productId,
    productTitle: product.title,
    productImage: productImage?.imageUrl || "",
    offerAmount: offer.offerAmount,
  }).catch((err) =>
    console.error("Failed to send offer accepted notification:", err)
  );

  res.json({
    message: "Offer accepted successfully",
    offer: updatedOffer,
    transaction: transaction,
  });
};

// Reject an offer
export const rejectOffer = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Get offer details
  const [offer] = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.id, id))
    .limit(1);

  if (!offer) {
    throw new AppError("Offer not found", 404);
  }

  if (offer.sellerId !== userId) {
    throw new AppError("Not authorized to reject this offer", 403);
  }

  if (offer.status !== "pending") {
    throw new AppError("Offer is not pending", 400);
  }

  // Update offer status
  const [updatedOffer] = await db
    .update(offersTable)
    .set({
      status: "rejected",
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(offersTable.id, id))
    .returning();

  // Find the conversation with this offer
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.offerId, id))
    .limit(1);

  if (conversation) {
    // Create automatic message
    const messageContent = `I decline your offer of ₱${parseFloat(
      offer.offerAmount
    ).toLocaleString()}.`;

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
    io.to(offer.buyerId).emit("offer_rejected", {
      offerId: offer.id,
      conversationId: conversation.id,
      offerAmount: offer.offerAmount,
    });

    io.to(offer.buyerId).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });
  }

  // Get product info for notification
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, offer.productId))
    .limit(1);

  // Get product image for notification
  const [productImage] = await db
    .select()
    .from(productImagesTable)
    .where(
      and(
        eq(productImagesTable.productId, offer.productId),
        eq(productImagesTable.isPrimary, true)
      )
    )
    .limit(1);

  // Notify buyer that offer was rejected
  if (product) {
    notifyOfferRejected({
      userId: offer.buyerId,
      productId: offer.productId,
      productTitle: product.title,
      productImage: productImage?.imageUrl || "",
      offerAmount: offer.offerAmount,
    }).catch((err) =>
      console.error("Failed to send offer rejected notification:", err)
    );
  }

  res.json({
    message: "Offer rejected successfully",
    offer: updatedOffer,
  });
};

// Update an offer (buyer only)
export const updateOfferAmount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { newAmount } = req.body;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  if (!newAmount) {
    throw new AppError("New offer amount is required", 400);
  }

  // Get offer details
  const [offer] = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.id, id))
    .limit(1);

  if (!offer) {
    throw new AppError("Offer not found", 404);
  }

  if (offer.buyerId !== userId) {
    throw new AppError("Not authorized to update this offer", 403);
  }

  // Can update if pending or rejected
  if (offer.status !== "pending" && offer.status !== "rejected") {
    throw new AppError(`Cannot update offer that is ${offer.status}`, 400);
  }

  // Update offer amount and reset to pending
  const [updatedOffer] = await db
    .update(offersTable)
    .set({
      offerAmount: newAmount,
      status: "pending",
      respondedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(offersTable.id, id))
    .returning();

  // Find the conversation with this offer
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.offerId, id))
    .limit(1);

  if (conversation) {
    // Create automatic message
    const messageContent = `I updated my offer to ₱${parseFloat(
      newAmount
    ).toLocaleString()}.`;

    const [newMessage] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        content: messageContent,
        isRead: false,
      })
      .returning();

    // Emit socket events to seller
    io.to(offer.sellerId).emit("offer_updated", {
      offerId: offer.id,
      conversationId: conversation.id,
      newAmount: newAmount,
    });

    io.to(offer.sellerId).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });
  }

  res.json({
    message: "Offer updated successfully",
    offer: updatedOffer,
  });
};

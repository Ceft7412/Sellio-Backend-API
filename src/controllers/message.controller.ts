import { Request, Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  conversationsTable,
  offersTable,
  usersTable,
  transactions,
  bidsTable,
  productsTable,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { desc, eq, inArray, or, ne } from "drizzle-orm";

import { messagesTable } from "../db/schema";
import { and } from "drizzle-orm";
import { io } from "../index";
import {
  uploadToGCS,
  generateUniqueFileName,
} from "../services/storage.service";
import {
  notifyNewMessage,
  notifyBuyRequest,
  notifyProductInquiry,
  notifyNewOffer,
} from "./notification.controller";
import { sendMessage as sendSMS } from "./sms.controller";

export const createNormalConversation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { participant2Id, productId } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!participant2Id) throw new AppError("participant2Id is required", 400);

    // Check if conversation already exists between these two users for this product
    const existingConversation = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.productId, productId || null),
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, participant2Id)
        )
      )
      .limit(1);

    if (existingConversation.length > 0) {
      // Return existing conversation
      return res.status(200).json({
        message: "Conversation already exists",
        conversation: existingConversation[0],
      });
    }

    // Also check reverse (participant1 and participant2 swapped)
    const existingConversationReverse = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.productId, productId || null),
          eq(conversationsTable.participant1Id, participant2Id),
          eq(conversationsTable.participant2Id, userId)
        )
      )
      .limit(1);

    if (existingConversationReverse.length > 0) {
      // Return existing conversation
      return res.status(200).json({
        message: "Conversation already exists",
        conversation: existingConversationReverse[0],
      });
    }

    // Create a new conversation
    const [newConversation] = await db
      .insert(conversationsTable)
      .values({
        participant1Id: userId,
        participant2Id: participant2Id,
        productId: productId || null,
      })
      .returning();

    if (!newConversation) {
      throw new AppError("Conversation not created", 400);
    }

    // Send notification to seller if this is a product conversation
    if (productId) {
      // Get inquirer info
      const [inquirer] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      // Get product info
      const [product] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      if (inquirer && product) {
        notifyProductInquiry({
          userId: participant2Id,
          inquirerName: inquirer.displayName || "Someone",
          inquirerAvatar: inquirer.avatarUrl || "",
          productId,
          productTitle: product.title,
          conversationId: newConversation.id,
        }).catch((err) =>
          console.error("Failed to send product inquiry notification:", err)
        );
      }
    }

    res.status(201).json({
      message: "Conversation created successfully",
      conversation: newConversation,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    throw error;
  }
};

// Get single conversation by ID
export const getConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Fetch the conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId));

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    // Verify user is part of this conversation
    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError("Unauthorized access to conversation", 403);
    }

    // Get the opposite user
    const oppositeUserId =
      conversation.participant1Id === userId
        ? conversation.participant2Id
        : conversation.participant1Id;

    const [oppositeUser] = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        identityVerified: usersTable.identityVerifiedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, oppositeUserId));

    // Get product info if exists
    let productInfo = null;
    if (conversation.productId) {
      const { productsTable, productImagesTable } = await import(
        "../db/schema"
      );

      const [product] = await db
        .select({
          id: productsTable.id,
          title: productsTable.title,
          price: productsTable.price,
        })
        .from(productsTable)
        .where(eq(productsTable.id, conversation.productId));

      if (product) {
        // Get product image
        const [productImage] = await db
          .select({
            imageUrl: productImagesTable.imageUrl,
          })
          .from(productImagesTable)
          .where(
            and(
              eq(productImagesTable.productId, product.id),
              eq(productImagesTable.isPrimary, true)
            )
          )
          .limit(1);

        productInfo = {
          id: product.id,
          title: product.title,
          price: product.price,
          imageUrl: productImage?.imageUrl || null,
        };
      }
    }

    // Get offer details if this conversation has an offer
    let offerDetails = null;
    if (conversation.offerId) {
      const [offer] = await db
        .select({
          id: offersTable.id,
          offerAmount: offersTable.offerAmount,
          status: offersTable.status,
          buyerId: offersTable.buyerId,
          sellerId: offersTable.sellerId,
        })
        .from(offersTable)
        .where(eq(offersTable.id, conversation.offerId));

      if (offer) {
        offerDetails = {
          id: offer.id,
          amount: offer.offerAmount,
          status: offer.status,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
        };
      }
    }

    // Get buy details if this conversation has a buy
    let buyDetails = null;
    if (conversation.buyId) {
      const { buysTable } = await import("../db/schema");

      const [buy] = await db
        .select({
          id: buysTable.id,
          purchasePrice: buysTable.purchasePrice,
          status: buysTable.status,
          buyerId: buysTable.buyerId,
          sellerId: buysTable.sellerId,
        })
        .from(buysTable)
        .where(eq(buysTable.id, conversation.buyId));

      if (buy) {
        buyDetails = {
          id: buy.id,
          amount: buy.purchasePrice,
          status: buy.status,
          buyerId: buy.buyerId,
          sellerId: buy.sellerId,
        };
      }
    }

    // Get bid details if this conversation has a bid
    let bidDetails = null;
    if (conversation.bidId) {
      const [bid] = await db
        .select({
          id: bidsTable.id,
          bidAmount: bidsTable.bidAmount,
          status: bidsTable.status,
          bidderId: bidsTable.bidderId,
          productId: bidsTable.productId,
        })
        .from(bidsTable)
        .where(eq(bidsTable.id, conversation.bidId));

      if (bid) {
        bidDetails = {
          id: bid.id,
          bidAmount: bid.bidAmount,
          status: bid.status,
          bidderId: bid.bidderId,
          productId: bid.productId,
        };
      }
    }

    // Get transaction details if this conversation has a transaction
    let transactionDetails = null;
    if (conversation.transactionId) {
      const [transaction] = await db
        .select({
          id: transactions.id,
          status: transactions.status,
          meetupStatus: transactions.meetupStatus,
          scheduledMeetupAt: transactions.scheduledMeetupAt,
          meetupLocation: transactions.meetupLocation,
          meetupCoordinates: transactions.meetupCoordinates,
          meetupProposedBy: transactions.meetupProposedBy,
          agreedPrice: transactions.agreedPrice,
          buyerId: transactions.buyerId,
          sellerId: transactions.sellerId,
        })
        .from(transactions)
        .where(eq(transactions.id, conversation.transactionId));

      if (transaction) {
        transactionDetails = {
          id: transaction.id,
          status: transaction.status,
          meetupStatus: transaction.meetupStatus,
          scheduledMeetupAt: transaction.scheduledMeetupAt,
          meetupLocation: transaction.meetupLocation,
          meetupCoordinates: transaction.meetupCoordinates,
          meetupProposedBy: transaction.meetupProposedBy,
          agreedPrice: transaction.agreedPrice,
          buyerId: transaction.buyerId,
          sellerId: transaction.sellerId,
        };
      }
    }

    res.status(200).json({
      message: "Conversation fetched successfully",
      conversation: {
        ...conversation,
        oppositeUser: oppositeUser
          ? {
              id: oppositeUser.id,
              displayName: oppositeUser.displayName,
              avatarUrl: oppositeUser.avatarUrl,
              identityVerified: !!oppositeUser.identityVerified,
            }
          : null,
        product: productInfo,
        offer: offerDetails,
        buy: buyDetails,
        bid: bidDetails,
        transaction: transactionDetails,
      },
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// Create negotiable conversation with automatic message
export const createNegotiableConversation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { participant2Id, productId, offerPrice, productTitle } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!participant2Id) throw new AppError("participant2Id is required", 400);
    if (!productId) throw new AppError("productId is required", 400);
    if (!offerPrice) throw new AppError("offerPrice is required", 400);

    // Try getting the product
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    // Check if conversation already exists
    const existingOfferConversation = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.productId, productId),
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, participant2Id)
        )
      )
      .limit(1);

    let conversation;

    if (
      existingOfferConversation.length > 0 &&
      existingOfferConversation[0].offerId
    ) {
      conversation = existingOfferConversation[0];
      // Update the offer price in the conversation
      await db
        .update(offersTable)
        .set({
          offerAmount: offerPrice,
        })
        .where(eq(offersTable.id, existingOfferConversation[0].offerId));

      // Create the message update offer message
      const messageContent = `I updated my offer to ₱${parseFloat(
        offerPrice
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

      // Emit socket event to the seller (participant2Id)
      io.to(participant2Id).emit("new_message", {
        conversationId: conversation.id,
        message: newMessage,
      });
    } else {
      // Check reverse
      const existingConversationReverse = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.productId, productId),
            eq(conversationsTable.participant1Id, participant2Id),
            eq(conversationsTable.participant2Id, userId)
          )
        )
        .limit(1);

      if (
        existingConversationReverse.length > 0 &&
        existingConversationReverse[0].offerId
      ) {
        conversation = existingConversationReverse[0];
        // Update the offer price in the conversation
        await db
          .update(offersTable)
          .set({
            offerAmount: offerPrice,
          })
          .where(eq(offersTable.id, existingConversationReverse[0].offerId));

        // Create the message update offer message
        const messageContent = `I updated my offer to ₱${parseFloat(
          offerPrice
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

        // Emit socket event to the seller (participant2Id)
        io.to(participant2Id).emit("new_message", {
          conversationId: conversation.id,
          message: newMessage,
        });
      } else {
        // Create new offer
        const [newOffer] = await db
          .insert(offersTable)
          .values({
            productId: productId,
            buyerId: userId,
            sellerId: participant2Id,
            offerAmount: offerPrice,
          })
          .returning();
        // Create new conversation
        const [newConversation] = await db
          .insert(conversationsTable)
          .values({
            participant1Id: userId,
            participant2Id: participant2Id,
            productId: productId,
            offerId: newOffer.id,
          })
          .returning();

        conversation = newConversation;

        // Create automatic message from buyer
        const messageContent = `I made an offer of ₱${parseFloat(
          offerPrice
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

        // Emit socket event to the seller (participant2Id)
        io.to(participant2Id).emit("new_message", {
          conversationId: conversation.id,
          message: newMessage,
        });

        // Send notification to seller about new offer
        const [buyer] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        if (buyer) {
          notifyNewOffer({
            userId: participant2Id,
            buyerName: buyer.displayName || "Someone",
            buyerAvatar: buyer.avatarUrl || "",
            productId,
            productTitle: product.title,
            offerAmount: offerPrice,
          }).catch((err) =>
            console.error("Failed to send new offer notification:", err)
          );

          // Send SMS to seller if they have a phone number
          const [seller] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, participant2Id))
            .limit(1);

          if (seller && seller.phoneNumber) {
            const smsMessage = `New offer received! ${
              buyer.displayName || "Someone"
            } made an offer of ₱${parseFloat(
              offerPrice
            ).toLocaleString()} for "${product.title}".`;

            sendSMS(smsMessage, seller.phoneNumber).catch((err) =>
              console.error(`Failed to send SMS to seller ${seller.id}:`, err)
            );
          }
        }
      }
    }

    res.status(201).json({
      message: "Negotiable conversation created successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error creating negotiable conversation:", error);
    throw error;
  }
};

// Create buy conversation with automatic message
export const createBuyConversation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { participant2Id, productId, productTitle } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!participant2Id) throw new AppError("participant2Id is required", 400);
    if (!productId) throw new AppError("productId is required", 400);
    if (!productTitle) throw new AppError("productTitle is required", 400);

    // Get product price
    const { productsTable, buysTable } = await import("../db/schema");
    const [product] = await db
      .select({
        price: productsTable.price,
        status: productsTable.status,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    if (product.status !== "active") {
      throw new AppError("Product is not available", 400);
    }

    // Check if conversation already exists
    const existingConversation = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.productId, productId),
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, participant2Id)
        )
      )
      .limit(1);

    let conversation;
    let buy;

    if (existingConversation.length > 0) {
      conversation = existingConversation[0];

      // Check if buy already exists for this conversation
      if (conversation.buyId) {
        const [existingBuy] = await db
          .select()
          .from(buysTable)
          .where(eq(buysTable.id, conversation.buyId));

        buy = existingBuy;
      }
    } else {
      // Check reverse
      const existingConversationReverse = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.productId, productId),
            eq(conversationsTable.participant1Id, participant2Id),
            eq(conversationsTable.participant2Id, userId)
          )
        )
        .limit(1);

      if (existingConversationReverse.length > 0) {
        conversation = existingConversationReverse[0];

        // Check if buy already exists for this conversation
        if (conversation.buyId) {
          const [existingBuy] = await db
            .select()
            .from(buysTable)
            .where(eq(buysTable.id, conversation.buyId));

          buy = existingBuy;
        }
      }
    }

    // Create buy record if it doesn't exist
    if (!buy) {
      const [newBuy] = await db
        .insert(buysTable)
        .values({
          productId: productId,
          buyerId: userId,
          sellerId: participant2Id,
          purchasePrice: product.price,
          originalPrice: product.price,
          status: "pending",
        })
        .returning();

      buy = newBuy;
    }

    // Create or update conversation
    if (!conversation) {
      const [newConversation] = await db
        .insert(conversationsTable)
        .values({
          participant1Id: userId,
          participant2Id: participant2Id,
          productId: productId,
          buyId: buy.id,
        })
        .returning();

      conversation = newConversation;
    } else if (!conversation.buyId) {
      // Update conversation with buyId if it doesn't have one
      const [updatedConversation] = await db
        .update(conversationsTable)
        .set({ buyId: buy.id })
        .where(eq(conversationsTable.id, conversation.id))
        .returning();

      conversation = updatedConversation;
    }

    // Create automatic message from buyer
    const messageContent = `I want to buy ${productTitle}.`;

    const [newMessage] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        content: messageContent,
        isRead: false,
      })
      .returning();

    // Emit socket event to the seller (participant2Id)
    io.to(participant2Id).emit("new_message", {
      conversationId: conversation.id,
      message: newMessage,
    });

    // Send notification to seller about buy request
    const [buyer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (buyer) {
      notifyBuyRequest({
        userId: participant2Id,
        buyerName: buyer.displayName || "Someone",
        buyerAvatar: buyer.avatarUrl || "",
        productId,
        productTitle,
      }).catch((err) =>
        console.error("Failed to send buy request notification:", err)
      );

      // Send SMS to seller if they have a phone number
      const [seller] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, participant2Id))
        .limit(1);

      if (seller && seller.phoneNumber) {
        const smsMessage = `New buy request! ${
          buyer.displayName || "Someone"
        } wants to buy "${productTitle}".`;

        sendSMS(smsMessage, seller.phoneNumber).catch((err) =>
          console.error(`Failed to send SMS to seller ${seller.id}:`, err)
        );
      }
    }

    res.status(201).json({
      message: "Buy conversation created successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error creating buy conversation:", error);
    throw error;
  }
};

// Send a new message (text or image)
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      conversationId,
      content,
      messageType = "text",
      imageUrl,
    } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);
    // Allow empty content for image messages
    if (messageType !== "image" && !content)
      throw new AppError("Message content is required", 400);
    if (messageType === "image" && !imageUrl)
      throw new AppError("Image URL is required for image messages", 400);

    // Verify user is part of this conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError("Unauthorized access to conversation", 403);
    }

    // Create the message
    const [newMessage] = await db
      .insert(messagesTable)
      .values({
        conversationId,
        senderId: userId,
        content: content || "",
        messageType,
        imageUrl: imageUrl || null,
        isRead: false,
      })
      .returning();

    if (!newMessage) {
      throw new AppError("Failed to create message", 500);
    }

    // Get the recipient ID
    const recipientId =
      conversation.participant1Id === userId
        ? conversation.participant2Id
        : conversation.participant1Id;

    // Emit socket event to the recipient
    io.to(recipientId).emit("new_message", {
      conversationId,
      message: newMessage,
    });

    // Send notification to recipient
    // Get sender info
    const [sender] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    // Get product info if this is a product conversation
    let productId = conversation.productId;

    if (sender) {
      const messagePreview =
        messageType === "image"
          ? "Sent an image"
          : content.length > 50
          ? content.substring(0, 50) + "..."
          : content;

      notifyNewMessage({
        userId: recipientId,
        senderName: sender.displayName || "Someone",
        senderAvatar: sender.avatarUrl || "",
        productId: productId || "",
        conversationId,
        messagePreview,
      }).catch((err) =>
        console.error("Failed to send message notification:", err)
      );
    }

    res.status(201).json({
      message: "Message sent successfully",
      data: newMessage,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

// Get all messages for a conversation
export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Verify user is part of this conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError("Unauthorized access to conversation", 403);
    }

    // Fetch all messages for this conversation
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    res.status(200).json({
      message: "Messages fetched successfully",
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    throw error;
  }
};

// Mark messages as read when user opens conversation
export const markMessagesAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Verify user is part of this conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError("Unauthorized access to conversation", 403);
    }

    // Mark all unread messages in this conversation that are NOT sent by current user as read
    await db
      .update(messagesTable)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          eq(messagesTable.isRead, false),
          // Only mark messages NOT sent by the current user
          eq(
            messagesTable.senderId,
            conversation.participant1Id === userId
              ? conversation.participant2Id
              : conversation.participant1Id
          )
        )
      );

    // Emit socket event to the other user that messages were read
    const otherUserId =
      conversation.participant1Id === userId
        ? conversation.participant2Id
        : conversation.participant1Id;

    io.to(otherUserId).emit("messages_read", {
      conversationId,
      readBy: userId,
    });

    res.status(200).json({
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    throw error;
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("User not authenticated", 401);
    console.log("userId", userId);
    // Get all conversations for this user (as participant1 or participant2)
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(
        or(
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, userId)
        )
      );

    const conversationIds = conversations.map((c) => c.id);

    // Fetch unread messages for each conversation
    let unreadCounts: Record<string, number> = {};

    if (conversationIds.length > 0) {
      // Query all unread messages for these conversations, sent by NOT the user
      const unreadMessages = await db
        .select({
          conversationId: messagesTable.conversationId,
        })
        .from(messagesTable)
        .where(
          and(
            inArray(messagesTable.conversationId, conversationIds),
            eq(messagesTable.isRead, false),
            ne(messagesTable.senderId, userId) // Exclude messages sent by current user
          )
        );

      // Count by conversationId
      for (const item of unreadMessages) {
        if (!unreadCounts[item.conversationId])
          unreadCounts[item.conversationId] = 0;
        unreadCounts[item.conversationId]++;
      }
    }

    // For each conversation, fetch the info of the opposite user
    const otherParticipantIds = Array.from(
      new Set(
        conversations.map((conv) =>
          conv.participant1Id === userId
            ? conv.participant2Id
            : conv.participant1Id
        )
      )
    );

    // Fetch all opposite users' info in one go
    const oppositeUsersRaw =
      otherParticipantIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              displayName: usersTable.displayName,
              avatarUrl: usersTable.avatarUrl,
              identityVerified: usersTable.identityVerifiedAt,
            })
            .from(usersTable)
            .where(inArray(usersTable.id, otherParticipantIds))
        : [];

    // Map for quick access
    const oppositeUsers: Record<string, any> = {};
    for (const user of oppositeUsersRaw) {
      oppositeUsers[user.id] = {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        identityVerified: !!user.identityVerified, // normalize as boolean
      };
    }

    // Fetch the most recent message for each conversation to provide "last message at"
    let lastMessageInfo: Record<
      string,
      { createdAt: string | null; content: string } | null
    > = {};
    if (conversationIds.length > 0) {
      const lastMessages = await db
        .select({
          conversationId: messagesTable.conversationId,
          createdAt: messagesTable.createdAt,
          content: messagesTable.content,
        })
        .from(messagesTable)
        .where(inArray(messagesTable.conversationId, conversationIds))
        .orderBy(messagesTable.conversationId, desc(messagesTable.createdAt));

      for (const msg of lastMessages) {
        if (!lastMessageInfo[msg.conversationId]) {
          lastMessageInfo[msg.conversationId] = {
            createdAt: msg.createdAt
              ? new Date(msg.createdAt).toISOString()
              : null,
            content: msg.content,
          };
        }
      }
    }

    // NEW: If any conversation has a productId, fetch product info (title, primary image)
    // We'll get all unique productIds from conversations
    const productIds = Array.from(
      new Set(
        conversations.map((conv) => conv.productId).filter((pid) => !!pid)
      )
    ) as string[];

    let productsById: Record<
      string,
      { id: string; title: string; imageUrl: string | null }
    > = {};

    if (productIds.length > 0) {
      // We'll lazily import here to avoid any import cycles for schema
      const { productsTable, productImagesTable } = await import(
        "../db/schema"
      );

      // Fetch product title for these products
      const productsRaw = await db
        .select({
          id: productsTable.id,
          title: productsTable.title,
        })
        .from(productsTable)
        .where(inArray(productsTable.id, productIds));

      // Fetch product images (get the primary image per product if possible, else first by order)
      const productImagesRaw = await db
        .select({
          id: productImagesTable.id,
          productId: productImagesTable.productId,
          imageUrl: productImagesTable.imageUrl,
          isPrimary: productImagesTable.isPrimary,
          order: productImagesTable.order,
        })
        .from(productImagesTable)
        .where(inArray(productImagesTable.productId, productIds));

      // Group images by productId
      const imagesByProductId: Record<string, any[]> = {};
      for (const img of productImagesRaw) {
        if (!imagesByProductId[img.productId])
          imagesByProductId[img.productId] = [];
        imagesByProductId[img.productId].push(img);
      }

      // Compose productId -> { title, imageUrl }
      for (const prod of productsRaw) {
        const images = imagesByProductId[prod.id] || [];
        // Prefer primary, else first by order or null
        let thumbnail: string | null = null;
        const primary = images.find((img: any) => img.isPrimary);
        if (primary) {
          thumbnail = primary.imageUrl;
        } else if (images.length > 0) {
          // order by order ascending if set
          images.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          thumbnail = images[0].imageUrl;
        }
        productsById[prod.id] = {
          id: prod.id,
          title: prod.title,
          imageUrl: thumbnail,
        };
      }
    }

    // Compose the result
    const result = conversations.map((conv) => {
      const oppositeUserId =
        conv.participant1Id === userId
          ? conv.participant2Id
          : conv.participant1Id;

      // Attach product info if present
      let productInfo = null;
      if (conv.productId && productsById[conv.productId]) {
        productInfo = {
          id: productsById[conv.productId].id,
          title: productsById[conv.productId].title,
          imageUrl: productsById[conv.productId].imageUrl,
        };
      }

      return {
        ...conv,
        unreadMessageCount: unreadCounts[conv.id] || 0,
        oppositeUser: oppositeUsers[oppositeUserId] || null,
        lastMessage: lastMessageInfo[conv.id]
          ? {
              createdAt: lastMessageInfo[conv.id]?.createdAt,
              content: lastMessageInfo[conv.id]?.content,
            }
          : null,
        product: productInfo,
      };
    });

    // Sort conversations: unread first (by most recent), then all others by timestamp
    result.sort((a, b) => {
      const hasUnreadA = a.unreadMessageCount > 0;
      const hasUnreadB = b.unreadMessageCount > 0;

      // Get timestamps
      const aTime = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const bTime = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;

      // Both have unread messages - sort by most recent
      if (hasUnreadA && hasUnreadB) {
        return bTime - aTime;
      }

      // Only A has unread - A comes first
      if (hasUnreadA && !hasUnreadB) {
        return -1;
      }

      // Only B has unread - B comes first
      if (!hasUnreadA && hasUnreadB) {
        return 1;
      }

      // Neither has unread - sort by most recent
      return bTime - aTime;
    });

    res.status(200).json({
      message: "Conversations fetched successfully",
      conversations: result,
      count: result.length,
    });
  } catch (error) {
    console.error(error);
    throw new AppError("Conversations not found", 400);
  }
};

// Upload chat image to GCS
export const uploadChatImage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("User not authenticated", 401);

    // Check if file exists in request
    if (!req.file) {
      throw new AppError("No image file provided", 400);
    }

    const file = req.file;

    // Validate file type
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError(
        "Invalid file type. Only JPEG, PNG, and WebP are allowed",
        400
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new AppError("File size exceeds 5MB limit", 400);
    }

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(file.originalname);

    // Upload to GCS in "chat_images" folder
    const imageUrl = await uploadToGCS(
      file.buffer,
      uniqueFileName,
      file.mimetype,
      "chat_images"
    );

    res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    console.error("Error uploading chat image:", error);
    throw error;
  }
};

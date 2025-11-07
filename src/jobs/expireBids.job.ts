import cron from "node-cron";
import { db } from "../db/connection.js";
import {
  productsTable,
  bidsTable,
  transactions,
  conversationsTable,
  messagesTable,
  usersTable,
  productImagesTable,
} from "../db/schema.js";
import { eq, and, lt, desc } from "drizzle-orm";
import { io } from "../index.js";
import { notifyBidWon } from "../controllers/notification.controller.js";
import { sendMessage as sendSMS } from "../controllers/sms.controller.js";

/**
 * Auto-close bidding for products where biddingEndsAt has passed
 * - Find the highest bidder
 * - Create a transaction for the winner
 * - Send automatic message to winner
 * - Mark other bids as "lost"
 * - Update product status to "in_transaction"
 *
 * Runs every 5 minutes
 */
export const expireBidsJob = cron.schedule(
  "* * * * *", // Run every minute
  async () => {
    console.log("⏰ Running expired bids cleanup job...");

    try {
      const now = new Date();

      // Find all active bidding products where bidding has ended
      const expiredBiddingProducts = await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.saleType, "bidding"),
            eq(productsTable.status, "active"),
            lt(productsTable.biddingEndsAt, now)
          )
        );

      if (expiredBiddingProducts.length === 0) {
        console.log("✅ No expired bidding products found");
        return;
      }

      console.log(
        `📋 Found ${expiredBiddingProducts.length} expired bidding products`
      );

      // Process each expired bidding product
      for (const product of expiredBiddingProducts) {
        try {
          // Find the highest bid for this product
          const [highestBid] = await db
            .select()
            .from(bidsTable)
            .where(eq(bidsTable.productId, product.id))
            .orderBy(desc(bidsTable.bidAmount))
            .limit(1);

          if (!highestBid) {
            // No bids placed, just mark product as expired
            await db
              .update(productsTable)
              .set({
                status: "expired",
                updatedAt: new Date(),
              })
              .where(eq(productsTable.id, product.id));

            console.log(
              `⏭️ Product ${product.id} expired with no bids - marked as expired`
            );
            continue;
          }

          // Get winner (highest bidder) details
          const [winner] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, highestBid.bidderId))
            .limit(1);

          if (!winner) {
            console.error(`❌ Winner user not found for bid ${highestBid.id}`);
            continue;
          }

          // Mark the winning bid as "won"
          await db
            .update(bidsTable)
            .set({ status: "won" })
            .where(eq(bidsTable.id, highestBid.id));

          // Mark all other bids as "lost"
          await db
            .update(bidsTable)
            .set({ status: "lost" })
            .where(
              and(
                eq(bidsTable.productId, product.id),
                eq(bidsTable.status, "active")
              )
            );

          // Create transaction record with 24-hour expiry (similar to offer/buy)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          const [transaction] = await db
            .insert(transactions)
            .values({
              bidId: highestBid.id,
              productId: product.id,
              buyerId: highestBid.bidderId,
              sellerId: product.sellerId,
              agreedPrice: highestBid.bidAmount,
              originalPrice: product.price,
              status: "active",
              meetupStatus: "not_scheduled",
              expiresAt: expiresAt,
            })
            .returning();

          // Update product status to "in_transaction" (not sold yet)
          await db
            .update(productsTable)
            .set({
              status: "in_transaction",
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, product.id));

          // Find or create conversation between winner and seller
          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.productId, product.id),
                eq(conversationsTable.participant1Id, highestBid.bidderId),
                eq(conversationsTable.participant2Id, product.sellerId)
              )
            )
            .limit(1);

          // If no conversation exists, create one
          if (!conversation) {
            [conversation] = await db
              .insert(conversationsTable)
              .values({
                productId: product.id,
                bidId: highestBid.id,
                transactionId: transaction.id,
                participant1Id: highestBid.bidderId,
                participant2Id: product.sellerId,
                status: "active",
                lastMessageAt: new Date(),
              })
              .returning();
          } else {
            // Update existing conversation with bid and transaction info
            await db
              .update(conversationsTable)
              .set({
                bidId: highestBid.id,
                transactionId: transaction.id,
                lastMessageAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(conversationsTable.id, conversation.id));
          }

          // Create automatic congratulations message from seller
          const messageContent = `🎉 Congratulations! You won the bid for "${
            product.title
          }" with a final bid of ₱${parseFloat(
            highestBid.bidAmount
          ).toLocaleString()}! Please schedule a meetup to complete the transaction.`;

          const [newMessage] = await db
            .insert(messagesTable)
            .values({
              conversationId: conversation.id,
              senderId: product.sellerId, // Message from seller
              content: messageContent,
              isRead: false,
            })
            .returning();

          // Notify winner via socket
          io.to(highestBid.bidderId).emit("bid_won", {
            productId: product.id,
            productTitle: product.title,
            bidAmount: highestBid.bidAmount,
            conversationId: conversation.id,
            transactionId: transaction.id,
          });

          // Notify seller via socket
          io.to(product.sellerId).emit("bidding_ended", {
            productId: product.id,
            productTitle: product.title,
            winnerName: winner.displayName,
            bidAmount: highestBid.bidAmount,
            conversationId: conversation.id,
            transactionId: transaction.id,
          });

          // Send new message notification to both users
          io.to(highestBid.bidderId).emit("new_message", {
            conversationId: conversation.id,
            message: newMessage,
          });

          io.to(product.sellerId).emit("new_message", {
            conversationId: conversation.id,
            message: newMessage,
          });

          // Get product primary image for notification
          const [productImage] = await db
            .select()
            .from(productImagesTable)
            .where(eq(productImagesTable.productId, product.id))
            .orderBy(productImagesTable.isPrimary)
            .limit(1);

          // Send push notification to winner
          notifyBidWon({
            userId: highestBid.bidderId,
            productId: product.id,
            productTitle: product.title,
            productImage: productImage?.imageUrl || "",
            winningBid: highestBid.bidAmount,
          }).catch((err) =>
            console.error("Failed to send bid won notification:", err)
          );

          // Send SMS notification to winner if they have a phone number
          if (winner.phoneNumber) {
            const smsMessage = `Congratulations! You won the bid for "${
              product.title
            }" with ₱${parseFloat(
              highestBid.bidAmount
            ).toLocaleString()}. Please schedule a meetup to complete the transaction.`;

            sendSMS(smsMessage, winner.phoneNumber).catch((err) =>
              console.error(`Failed to send SMS to winner ${winner.id}:`, err)
            );
          }

          console.log(
            `✅ Bidding ended for product ${product.id} - Winner: ${
              winner.displayName
            } with bid ₱${parseFloat(highestBid.bidAmount).toLocaleString()}`
          );
        } catch (error) {
          console.error(
            `❌ Error processing expired bidding product ${product.id}:`,
            error
          );
        }
      }

      console.log(
        `🎉 Expired bids cleanup completed: ${expiredBiddingProducts.length} products processed`
      );
    } catch (error) {
      console.error("❌ Error in expired bids cleanup job:", error);
    }
  }
);

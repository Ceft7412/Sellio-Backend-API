import cron from "node-cron";
import { db } from "../db/connection";
import {
  transactions,
  conversationsTable,
  messagesTable,
  productsTable,
  offersTable,
  buysTable,
  bidsTable,
} from "../db/schema";
import { eq, and, lt } from "drizzle-orm";
import { io } from "../index";

/**
 * Auto-cancel transactions that are not completed within 24 hours of scheduled meetup
 * Runs every hour
 */
export const expireTransactionsJob = cron.schedule(
  "0 * * * *", // Run every hour at minute 0
  async () => {
    console.log("⏰ Running expired transactions cleanup job...");

    try {
      // Calculate cutoff time (24 hours ago)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Find all active transactions with scheduled meetup that are past 24 hours
      const expiredTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.status, "active"),
            lt(transactions.scheduledMeetupAt, twentyFourHoursAgo)
          )
        );

      if (expiredTransactions.length === 0) {
        console.log("✅ No expired transactions found");
        return;
      }

      console.log(
        `📋 Found ${expiredTransactions.length} expired transactions`
      );

      // Process each expired transaction
      for (const transaction of expiredTransactions) {
        try {
          // Update transaction to expired status
          await db
            .update(transactions)
            .set({
              status: "expired",
              cancelledAt: new Date(),
              cancellationReason:
                "Transaction automatically expired 24 hours after scheduled meetup time",
              lastActivityAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, transaction.id));

          // Update related records
          if (transaction.offerId) {
            await db
              .update(offersTable)
              .set({
                status: "expired",
                updatedAt: new Date(),
              })
              .where(eq(offersTable.id, transaction.offerId));
          }

          if (transaction.buyId) {
            await db
              .update(buysTable)
              .set({
                status: "expired",
                updatedAt: new Date(),
              })
              .where(eq(buysTable.id, transaction.buyId));
          }

          if (transaction.bidId) {
            await db
              .update(bidsTable)
              .set({
                status: "expired",
              })
              .where(eq(bidsTable.id, transaction.bidId));
          }

          // Reactivate product
          await db
            .update(productsTable)
            .set({
              status: "active",
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, transaction.productId));

          // Find conversation and send message
          const [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(eq(conversationsTable.transactionId, transaction.id))
            .limit(1);

          if (conversation) {
            // Create automatic expiration message
            const messageContent =
              "This transaction has been automatically cancelled as it was not completed within 24 hours of the scheduled meetup time.";

            const [newMessage] = await db
              .insert(messagesTable)
              .values({
                conversationId: conversation.id,
                senderId: transaction.sellerId, // Use seller as sender for system messages
                content: messageContent,
                isRead: false,
              })
              .returning();

            // Notify both users via socket
            io.to(transaction.buyerId).emit("transaction_expired", {
              transactionId: transaction.id,
              conversationId: conversation.id,
            });

            io.to(transaction.sellerId).emit("transaction_expired", {
              transactionId: transaction.id,
              conversationId: conversation.id,
            });

            io.to(transaction.buyerId).emit("new_message", {
              conversationId: conversation.id,
              message: newMessage,
            });

            io.to(transaction.sellerId).emit("new_message", {
              conversationId: conversation.id,
              message: newMessage,
            });
          }

          console.log(`✅ Expired transaction ${transaction.id}`);
        } catch (error) {
          console.error(
            `❌ Error expiring transaction ${transaction.id}:`,
            error
          );
        }
      }

      console.log(
        `🎉 Expired transactions cleanup completed: ${expiredTransactions.length} transactions processed`
      );
    } catch (error) {
      console.error("❌ Error in expired transactions cleanup job:", error);
    }
  }
);

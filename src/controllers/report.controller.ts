import { Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  reportsTable,
  usersTable,
  transactions,
  conversationsTable,
  productsTable,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { eq, and, sql } from "drizzle-orm";

// Submit a report against another user
export const submitReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      reportedUserId,
      productId,
      transactionId,
      reportType,
      details,
      conversationId,
    } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!reportedUserId)
      throw new AppError("Reported user ID is required", 400);
    if (!productId) throw new AppError("Product ID is required", 400);
    if (!transactionId) throw new AppError("Transaction ID is required", 400);
    if (!reportType) throw new AppError("Report type is required", 400);
    if (!conversationId) throw new AppError("Conversation ID is required", 400);

    // Validate that user cannot report themselves
    if (userId === reportedUserId) {
      throw new AppError("You cannot report yourself", 400);
    }

    // Check if conversation exists and user is a participant
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId));

    if (!conversation) {
      throw new AppError("Conversation not found", 404);
    }

    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new AppError("You are not a participant in this conversation", 403);
    }

    // Check if transaction exists and belongs to the conversation
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    // Validate transaction status - must be completed, cancelled, or expired
    const allowedStatuses = [
      "completed",
      "cancelled_by_buyer",
      "cancelled_by_seller",
      "expired",
    ];
    if (!allowedStatuses.includes(transaction.status)) {
      throw new AppError(
        "You can only report users after the transaction is completed, cancelled, or expired",
        400
      );
    }

    // Validate that the reported user is actually part of this transaction
    if (
      transaction.buyerId !== reportedUserId &&
      transaction.sellerId !== reportedUserId
    ) {
      throw new AppError("Reported user is not part of this transaction", 400);
    }

    // Validate that the reporter is part of this transaction
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new AppError("You are not part of this transaction", 403);
    }

    // Check if user has already reported this user for this transaction
    const [existingReport] = await db
      .select()
      .from(reportsTable)
      .where(
        and(
          eq(reportsTable.reporterId, userId),
          eq(reportsTable.transactionId, transactionId),
          eq(reportsTable.reportedUserId, reportedUserId)
        )
      );

    if (existingReport) {
      throw new AppError(
        "You have already submitted a report for this transaction",
        400
      );
    }

    // Create the report
    const [report] = await db
      .insert(reportsTable)
      .values({
        reporterId: userId,
        reportedUserId,
        productId,
        transactionId,
        reportType,
        details: details || null,
        status: "pending",
      })
      .returning();

    // Count reports of the same type for the reported user
    const reportCounts = await db
      .select({
        reportType: reportsTable.reportType,
        count: sql<number>`count(*)::int`,
      })
      .from(reportsTable)
      .where(eq(reportsTable.reportedUserId, reportedUserId))
      .groupBy(reportsTable.reportType);

    // Check if any report type has reached threshold
    for (const reportCount of reportCounts) {
      const count = Number(reportCount.count);

      // If 5 or more reports of same type -> ban permanently
      if (count >= 5) {
        await db
          .update(usersTable)
          .set({
            isBanned: true,
            bannedAt: new Date(),
            banReason: `Received ${count} reports of type: ${reportCount.reportType}`,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, reportedUserId));

        console.log(
          `User ${reportedUserId} banned due to ${count} reports of type: ${reportCount.reportType}`
        );
        break;
      }
      // If 4 reports of same type -> suspend for 1 week
      else if (count === 4) {
        const suspensionExpiry = new Date();
        suspensionExpiry.setDate(suspensionExpiry.getDate() + 7); // 1 week

        await db
          .update(usersTable)
          .set({
            isSuspended: true,
            suspendedAt: new Date(),
            suspensionExpiresAt: suspensionExpiry,
            suspensionReason: `Received 4 reports of type: ${reportCount.reportType}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, reportedUserId));

        console.log(
          `User ${reportedUserId} suspended until ${suspensionExpiry.toISOString()} due to 4 reports of type: ${
            reportCount.reportType
          }`
        );
        break;
      }
    }

    res.status(201).json({
      message: "Report submitted successfully",
      data: { report },
    });
  } catch (error) {
    throw error;
  }
};

// Get reports submitted by current user
export const getMyReports = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) throw new AppError("User not authenticated", 401);

    const reports = await db
      .select({
        id: reportsTable.id,
        reportType: reportsTable.reportType,
        details: reportsTable.details,
        status: reportsTable.status,
        createdAt: reportsTable.createdAt,
        reportedUser: {
          id: usersTable.id,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        },
        product: {
          id: productsTable.id,
          title: productsTable.title,
        },
      })
      .from(reportsTable)
      .leftJoin(usersTable, eq(reportsTable.reportedUserId, usersTable.id))
      .leftJoin(productsTable, eq(reportsTable.productId, productsTable.id))
      .where(eq(reportsTable.reporterId, userId));

    res.status(200).json({
      message: "Reports fetched successfully",
      data: { reports },
    });
  } catch (error) {
    throw error;
  }
};

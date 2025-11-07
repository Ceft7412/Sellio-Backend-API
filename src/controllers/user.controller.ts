import { Request, Response } from "express";
import { AppError } from "../middleware/error.middleware";
import { AuthRequest } from "../middleware/auth.middleware";
import { db } from "../db/connection";
import { usersTable, reviews } from "../db/schema";
import { eq, and, avg, count, sql } from "drizzle-orm";

export const verifyIdentity = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Set the user as verified
  try {
    await db
      .update(usersTable)
      .set({
        identityVerificationStatus: "verified",
        identityVerifiedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    res.json({
      message: "Identity verified successfully",
    });
  } catch (error) {
    throw new AppError("Failed to verify identity", 500);
  }
};

export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new AppError("User ID is required", 400);
    }

    // Get user details
    const [user] = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        identityVerified: usersTable.identityVerificationStatus,
        businessDocuments: usersTable.businessDocuments,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Get seller ratings (when user is reviewee as seller)
    const sellerRatingsResult = await db
      .select({
        averageRating: avg(reviews.rating),
        totalReviews: count(reviews.id),
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.revieweeId, userId),
          eq(reviews.revieweeRole, "seller")
        )
      );

    // Get buyer ratings (when user is reviewee as buyer)
    const buyerRatingsResult = await db
      .select({
        averageRating: avg(reviews.rating),
        totalReviews: count(reviews.id),
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.revieweeId, userId),
          eq(reviews.revieweeRole, "buyer")
        )
      );

    // Get recent reviews as seller (limit to 10 most recent)
    const sellerReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        reviewText: reviews.reviewText,
        isAnonymous: reviews.isAnonymous,
        createdAt: reviews.createdAt,
        reviewerId: reviews.reviewerId,
        reviewerName: usersTable.displayName,
        reviewerAvatar: usersTable.avatarUrl,
        blockchainTxHash: reviews.blockchainTxHash,
      })
      .from(reviews)
      .leftJoin(usersTable, eq(reviews.reviewerId, usersTable.id))
      .where(
        and(
          eq(reviews.revieweeId, userId),
          eq(reviews.revieweeRole, "seller")
        )
      )
      .orderBy(sql`${reviews.createdAt} DESC`)
      .limit(10);

    // Get recent reviews as buyer (limit to 10 most recent)
    const buyerReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        reviewText: reviews.reviewText,
        isAnonymous: reviews.isAnonymous,
        createdAt: reviews.createdAt,
        reviewerId: reviews.reviewerId,
        reviewerName: usersTable.displayName,
        reviewerAvatar: usersTable.avatarUrl,
        blockchainTxHash: reviews.blockchainTxHash,
      })
      .from(reviews)
      .leftJoin(usersTable, eq(reviews.reviewerId, usersTable.id))
      .where(
        and(
          eq(reviews.revieweeId, userId),
          eq(reviews.revieweeRole, "buyer")
        )
      )
      .orderBy(sql`${reviews.createdAt} DESC`)
      .limit(10);

    const sellerRating = sellerRatingsResult[0];
    const buyerRating = buyerRatingsResult[0];

    res.json({
      user: {
        ...user,
        identityVerified: user.identityVerified === "verified",
      },
      sellerRating: {
        averageRating: sellerRating.averageRating
          ? parseFloat(sellerRating.averageRating as string).toFixed(1)
          : null,
        totalReviews: Number(sellerRating.totalReviews) || 0,
      },
      buyerRating: {
        averageRating: buyerRating.averageRating
          ? parseFloat(buyerRating.averageRating as string).toFixed(1)
          : null,
        totalReviews: Number(buyerRating.totalReviews) || 0,
      },
      sellerReviews: sellerReviews.map((review) => ({
        ...review,
        rating: parseFloat(review.rating as string),
        // Hide reviewer info if anonymous
        reviewerName: review.isAnonymous ? "Anonymous" : review.reviewerName,
        reviewerAvatar: review.isAnonymous ? null : review.reviewerAvatar,
      })),
      buyerReviews: buyerReviews.map((review) => ({
        ...review,
        rating: parseFloat(review.rating as string),
        // Hide reviewer info if anonymous
        reviewerName: review.isAnonymous ? "Anonymous" : review.reviewerName,
        reviewerAvatar: review.isAnonymous ? null : review.reviewerAvatar,
      })),
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    const { displayName, phoneNumber, bio, avatarUrl, businessDocuments } =
      req.body;

    // Validate display name
    if (displayName !== undefined) {
      if (!displayName.trim()) {
        throw new AppError("Display name is required", 400);
      }
      if (displayName.trim().length < 3) {
        throw new AppError(
          "Display name must be at least 3 characters",
          400
        );
      }
    }

    // Validate Philippines phone number format (639XXXXXXXXX)
    if (phoneNumber !== undefined && phoneNumber !== null && phoneNumber !== "") {
      const phoneRegex = /^639\d{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        throw new AppError(
          "Invalid Philippines phone number format. Must be 639XXXXXXXXX (12 digits)",
          400
        );
      }
    }

    // Validate bio length
    if (bio !== undefined && bio.length > 500) {
      throw new AppError("Bio must not exceed 500 characters", 400);
    }

    // Build update object only with provided fields
    const updateData: any = {};
    if (displayName !== undefined) updateData.displayName = displayName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (bio !== undefined) updateData.bio = bio;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (businessDocuments !== undefined)
      updateData.businessDocuments = businessDocuments;

    // Update user profile
    await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId));

    // Fetch updated user data
    const [updatedUser] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        phoneNumber: usersTable.phoneNumber,
        bio: usersTable.bio,
        identityVerificationStatus: usersTable.identityVerificationStatus,
        businessDocuments: usersTable.businessDocuments,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    res.json({
      message: "Profile updated successfully",
      user: {
        ...updatedUser,
        identityVerified: updatedUser.identityVerificationStatus === "verified",
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    throw error;
  }
};

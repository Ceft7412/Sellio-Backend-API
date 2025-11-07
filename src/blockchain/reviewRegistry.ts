import { loadContractData } from "./index.js";
import { db } from "../db/connection.js";
import { reviews } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function registerReviewToBlockchain(
  reviewId: string,
  reviewerName: string,
  revieweeName: string,
  transactionId: string,
  comment: string,
  rating: string,
  createdAt: string
) {
  try {
    const contract = loadContractData("ReviewAndRating");
    if (!contract) {
      throw new Error("Failed to load ReviewRegistry contract");
    }

    const reviewStruct = {
      reviewer: reviewerName,
      reviewee: revieweeName,
      transactionId: transactionId,
      comment: comment,
      rating: rating,
      createdAt: createdAt,
    };

    const tx = await contract["submitReview"]!(reviewStruct);
    await tx.wait();
    const hash = tx.hash;

    // Store blockchain hash in the reviews table
    await db
      .update(reviews)
      .set({
        blockchainTxHash: hash,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId));

    console.log(`✅ Review ${reviewId} registered to blockchain with hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`❌ Error registering review ${reviewId} to blockchain:`, error);
    throw error;
  }
}

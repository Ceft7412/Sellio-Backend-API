import { loadContractData } from './index';

export async function registerReviewToBlockchain(
  reviewerName: string,
  revieweeName: string,
  transactionId: string,
  comment: string,
  rating: string,
  createdAt: string
) {
  const contract = loadContractData('ReviewAndRating');
  if (!contract) {
    throw new Error('Failed to load ReviewRegistry contract');
  }

  const reviewStruct = {
    reviewer: reviewerName,
    reviewee: revieweeName,
    transactionId: transactionId,
    comment: comment,
    rating: rating,
    createdAt: createdAt,
  };

  const tx = await contract['submitReview']!(reviewStruct);
  await tx.wait();
  return tx.hash;
}

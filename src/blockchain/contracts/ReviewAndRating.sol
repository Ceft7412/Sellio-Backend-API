// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract ReviewAndRating {
    struct Review {
        string reviewer;
        string reviewee;
        string transactionId;
        string comment;
        string rating; // 1–5
        string createdAt;
    }

    mapping(string => Review) public productReviews;

    // Option 1: Emit the entire struct (compact, clean)
    event ReviewSubmitted(string transactionId, Review review);

    function submitReview(Review calldata newReview) external {
        // Store the review
        productReviews[newReview.transactionId] = newReview;

        // Emit event with productId and struct
        emit ReviewSubmitted(newReview.transactionId, newReview);
    }
}

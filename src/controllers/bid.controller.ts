import { Response } from "express";
import { AppError } from "../middleware/error.middleware";
import {
  bidsTable,
  productsTable,
  usersTable,
  productImagesTable,
} from "../db/schema";
import { db } from "../db/connection";
import { AuthRequest } from "../middleware/auth.middleware";
import { eq, desc, and } from "drizzle-orm";
import { notifyNewBid, notifyOutbid } from "./notification.controller";

// Get bids for a product
export const getProductBids = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      throw new AppError("Product ID is required", 400);
    }

    // Verify product exists
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Fetch all bids for the product with bidder info
    const bids = await db
      .select({
        id: bidsTable.id,
        bidAmount: bidsTable.bidAmount,
        status: bidsTable.status,
        createdAt: bidsTable.createdAt,
        bidder: {
          id: usersTable.id,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          verified: usersTable.identityVerifiedAt,
        },
      })
      .from(bidsTable)
      .leftJoin(usersTable, eq(bidsTable.bidderId, usersTable.id))
      .where(eq(bidsTable.productId, productId))
      .orderBy(desc(bidsTable.bidAmount));

    // Get highest bid
    const highestBid = bids.length > 0 ? bids[0] : null;

    // Anonymize bidder names (only show first letter)
    const anonymizedBids = bids.map((bid) => ({
      id: bid.id,
      bidAmount: bid.bidAmount,
      status: bid.status,
      createdAt: bid.createdAt,
      bidder: {
        id: bid.bidder?.id,
        displayName: bid.bidder?.displayName
          ? bid.bidder.displayName.charAt(0).toUpperCase() + "***"
          : "Anonymous",
        avatarUrl: null, // Hide avatar for anonymity
        verified: bid.bidder?.verified || null,
      },
    }));

    res.status(200).json({
      message: "Bids fetched successfully",
      bids: anonymizedBids,
      bidCount: bids.length,
      highestBid: highestBid
        ? {
            amount: highestBid.bidAmount,
            createdAt: highestBid.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Error getting product bids:", error);
    throw error;
  }
};

// Place a bid
export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;
    const { bidAmount } = req.body;

    if (!userId) throw new AppError("User not authenticated", 401);
    if (!productId) throw new AppError("Product ID is required", 400);
    if (!bidAmount) throw new AppError("Bid amount is required", 400);

    // Get product details
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) throw new AppError("Product not found", 404);

    // Validate product is a bidding type
    if (product.saleType !== "bidding") {
      throw new AppError("This product is not available for bidding", 400);
    }

    // Check if bidding has ended
    if (product.biddingEndsAt && new Date(product.biddingEndsAt) < new Date()) {
      throw new AppError("Bidding has ended for this product", 400);
    }

    // Check if user is the seller
    if (product.sellerId === userId) {
      throw new AppError("You cannot bid on your own product", 400);
    }

    // Validate bid amount is >= product price (starting price)
    const productPrice = parseFloat(product.price);
    const bidValue = parseFloat(bidAmount);
    const minimumIncrement = product.minimumBid
      ? parseFloat(product.minimumBid)
      : 0;

    if (bidValue < productPrice) {
      throw new AppError(
        `Bid amount must be at least ₱${productPrice.toLocaleString()} (starting price)`,
        400
      );
    }

    // Get current highest bid
    const [highestBid] = await db
      .select()
      .from(bidsTable)
      .where(eq(bidsTable.productId, productId))
      .orderBy(desc(bidsTable.bidAmount))
      .limit(1);

    // If there's a highest bid, validate new bid
    if (highestBid) {
      const currentHighestBid = parseFloat(highestBid.bidAmount);

      // Check if new bid is higher than current highest
      if (bidValue <= currentHighestBid) {
        throw new AppError(
          `Bid amount must be higher than current highest bid of ₱${currentHighestBid.toLocaleString()}`,
          400
        );
      }

      // Validate bid follows minimum increment
      const difference = bidValue - currentHighestBid;
      if (difference < minimumIncrement) {
        throw new AppError(
          `Bid must be at least ₱${minimumIncrement.toLocaleString()} higher than current bid`,
          400
        );
      }

      // Check if bid follows increment pattern (must be in multiples of minimum increment)
      if (difference % minimumIncrement !== 0) {
        const nextValidBid = currentHighestBid + minimumIncrement;
        throw new AppError(
          `Bid must follow minimum increment of ₱${minimumIncrement.toLocaleString()}. Next valid bid: ₱${nextValidBid.toLocaleString()}`,
          400
        );
      }

      // Mark previous highest bid as outbid
      await db
        .update(bidsTable)
        .set({ status: "outbid" })
        .where(eq(bidsTable.id, highestBid.id));

      // Get previous bidder info to notify them
      const [previousBidder] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, highestBid.bidderId))
        .limit(1);

      // Get product image for notification
      const [productImage] = await db
        .select()
        .from(productImagesTable)
        .where(
          and(
            eq(productImagesTable.productId, productId),
            eq(productImagesTable.isPrimary, true)
          )
        )
        .limit(1);

      // Notify previous bidder they've been outbid
      if (previousBidder) {
        notifyOutbid({
          userId: previousBidder.id,
          productId: productId,
          productTitle: product.title,
          productImage: productImage?.imageUrl || "",
          newBidAmount: bidAmount.toString(),
        }).catch((err) =>
          console.error("Failed to send outbid notification:", err)
        );
      }
    } else {
      // No previous bids - validate against starting price + minimum increment
      const minimumFirstBid = productPrice + minimumIncrement;
      if (bidValue < minimumFirstBid) {
        throw new AppError(
          `First bid must be at least ₱${minimumFirstBid.toLocaleString()} (starting price + minimum increment)`,
          400
        );
      }

      // Check if bid follows increment pattern from starting price
      const difference = bidValue - productPrice;
      if (minimumIncrement > 0 && difference % minimumIncrement !== 0) {
        const nextValidBid = productPrice + minimumIncrement;
        throw new AppError(
          `Bid must follow minimum increment of ₱${minimumIncrement.toLocaleString()} from starting price. Minimum valid bid: ₱${nextValidBid.toLocaleString()}`,
          400
        );
      }
    }

    // Create new bid
    const [newBid] = await db
      .insert(bidsTable)
      .values({
        productId,
        bidderId: userId,
        bidAmount: bidAmount.toString(),
        status: "active",
      })
      .returning();

    // Get bidder info for notification
    const [bidder] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    // Notify seller about new bid
    if (bidder) {
      notifyNewBid({
        userId: product.sellerId,
        bidderName: bidder.displayName || "Anonymous",
        bidderAvatar: bidder.avatarUrl || "",
        productId: productId,
        productTitle: product.title,
        bidAmount: bidAmount.toString(),
      }).catch((err) =>
        console.error("Failed to send new bid notification:", err)
      );
    }

    res.status(201).json({
      message: "Bid placed successfully",
      bid: {
        id: newBid.id,
        bidAmount: newBid.bidAmount,
        status: newBid.status,
        createdAt: newBid.createdAt,
      },
    });
  } catch (error) {
    console.error("Error placing bid:", error);
    throw error;
  }
};

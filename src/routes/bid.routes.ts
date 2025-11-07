import { Router } from "express";
import { getProductBids, placeBid } from "../controllers/bid.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Get bids for a product (public - no auth required for viewing)
router.get("/products/:productId/bids", getProductBids);

// Place a bid (requires authentication)
router.post("/products/:productId/bids", authenticateToken, placeBid);

export default router;

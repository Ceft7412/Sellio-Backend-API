import { Router } from "express";
import {
  createOffer,
  getProductOffers,
  getUserOffers,
  acceptOffer,
  rejectOffer,
  updateOfferAmount,
} from "../controllers/offer.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All offer routes require authentication
router.post("/", authenticateToken, createOffer);
router.get("/product/:productId", authenticateToken, getProductOffers);
router.get("/user/my-offers", authenticateToken, getUserOffers);
router.put("/:id/accept", authenticateToken, acceptOffer);
router.put("/:id/reject", authenticateToken, rejectOffer);
router.put("/:id/update", authenticateToken, updateOfferAmount);

export default router;

import { Router } from "express";
import {
  proposeMeetup,
  acceptMeetup,
  markAsSold,
  cancelTransaction,
  getMyPurchases,
  getMySales,
  checkReviewExists,
  createReview,
} from "../controllers/transaction.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All transaction routes require authentication
router.get("/my-purchases", authenticateToken, getMyPurchases);
router.get("/my-sales", authenticateToken, getMySales);
router.post("/:transactionId/propose-meetup", authenticateToken, proposeMeetup);
router.post("/:transactionId/accept-meetup", authenticateToken, acceptMeetup);
router.post("/:transactionId/mark-as-sold", authenticateToken, markAsSold);
router.post("/:transactionId/cancel", authenticateToken, cancelTransaction);

// Review routes
router.get("/:transactionId/review-exists", authenticateToken, checkReviewExists);
router.post(
  "/:transactionId/review",
  authenticateToken,
  upload.array("images", 5),
  createReview
);

export default router;

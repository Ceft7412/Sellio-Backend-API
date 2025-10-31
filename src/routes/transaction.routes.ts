import { Router } from "express";
import {
  proposeMeetup,
  acceptMeetup,
} from "../controllers/transaction.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// All transaction routes require authentication
router.post("/:transactionId/propose-meetup", authenticateToken, proposeMeetup);
router.post("/:transactionId/accept-meetup", authenticateToken, acceptMeetup);

export default router;

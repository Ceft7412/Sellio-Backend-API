import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getUserDeviceTokens,
} from "../controllers/deviceToken.controller.js";

const router = Router();

// Register device token for push notifications
router.post("/register", authenticateToken, registerDeviceToken);

// Unregister device token (logout)
router.post("/unregister", authenticateToken, unregisterDeviceToken);

// Get user's device tokens
router.get("/", authenticateToken, getUserDeviceTokens);

export default router;

import { Router } from "express";
import {
  startLocationSharing,
  stopLocationSharing,
  updateLocation,
  getLocationSession,
} from "../controllers/location.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All location routes require authentication
router.post(
  "/:conversationId/start",
  authenticateToken,
  startLocationSharing
);
router.post("/:conversationId/stop", authenticateToken, stopLocationSharing);
router.post("/:conversationId/update", authenticateToken, updateLocation);
router.get("/:conversationId/session", authenticateToken, getLocationSession);

export default router;

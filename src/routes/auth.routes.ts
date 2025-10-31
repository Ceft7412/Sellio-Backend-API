import { Router } from "express";
import {
  register,
  login,
  getProfile,
  googleAuth,
} from "../controllers/auth.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleAuth);

// Protected routes
router.get("/profile", authenticateToken, getProfile);

export default router;

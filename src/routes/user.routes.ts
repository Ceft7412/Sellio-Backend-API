import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { verifyIdentity, getUserProfile, updateProfile } from "../controllers/user.controller.js";

const router = Router();

router.put("/verify-identity", authenticateToken, verifyIdentity);
router.get("/:userId/profile", getUserProfile);
router.put("/profile", authenticateToken, updateProfile);

export default router;

import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { verifyIdentity, getUserProfile, updateProfile } from "../controllers/user.controller";

const router = Router();

router.put("/verify-identity", authenticateToken, verifyIdentity);
router.get("/:userId/profile", authenticateToken, getUserProfile);
router.put("/profile", authenticateToken, updateProfile);

export default router;

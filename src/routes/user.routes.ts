import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { verifyIdentity } from "../controllers/user.controller";

const router = Router();

router.put("/verify-identity", authenticateToken, verifyIdentity);

export default router;

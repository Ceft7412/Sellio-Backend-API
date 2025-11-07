import { Router } from "express";
import { confirmBuy } from "../controllers/buy.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// All buy routes require authentication
router.put("/:id/confirm", authenticateToken, confirmBuy);

export default router;

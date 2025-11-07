import { Router } from "express";
import { confirmBuy } from "../controllers/buy.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All buy routes require authentication
router.put("/:id/confirm", authenticateToken, confirmBuy);

export default router;

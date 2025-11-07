import { Router } from "express";
import { submitReport, getMyReports } from "../controllers/report.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All report routes require authentication
router.post("/submit", authenticateToken, submitReport);
router.get("/my-reports", authenticateToken, getMyReports);

export default router;

import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { uploadMiddleware } from "../middleware/upload.middleware";
import { uploadAvatar, uploadDocument } from "../controllers/upload.controller";

const router = Router();

router.post(
  "/avatar",
  authenticateToken,
  uploadMiddleware.single("image"),
  uploadAvatar
);

router.post(
  "/document",
  authenticateToken,
  uploadMiddleware.single("image"),
  uploadDocument
);

export default router;

import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import {
  uploadToGCS,
  generateUniqueFileName,
} from "../services/storage.service.js";

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!req.file) {
      throw new AppError("No image file provided", 400);
    }

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(req.file.originalname);

    // Upload to GCS
    const imageUrl = await uploadToGCS(
      req.file.buffer,
      uniqueFileName,
      req.file.mimetype,
      "avatars"
    );

    res.json({
      message: "Avatar uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    throw error;
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!req.file) {
      throw new AppError("No document file provided", 400);
    }

    // Generate unique filename
    const uniqueFileName = generateUniqueFileName(req.file.originalname);

    // Upload to GCS
    const imageUrl = await uploadToGCS(
      req.file.buffer,
      uniqueFileName,
      req.file.mimetype,
      "business_documents"
    );

    res.json({
      message: "Document uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    throw error;
  }
};

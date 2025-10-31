import { Request, Response } from "express";
import { AppError } from "../middleware/error.middleware";
import { AuthRequest } from "../middleware/auth.middleware";
import { db } from "../db/connection";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export const verifyIdentity = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  // Set the user as verified
  try {
    await db
      .update(usersTable)
      .set({
        identityVerificationStatus: "verified",
        identityVerifiedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    res.json({
      message: "Identity verified successfully",
    });
  } catch (error) {
    throw new AppError("Failed to verify identity", 500);
  }
};

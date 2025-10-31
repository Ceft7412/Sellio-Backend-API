import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-this";
    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-this";
    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    // Invalid token, but continue without user
    next();
  }
};

import { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware.js";

const API_KEY = process.env.API_KEY || "271Iaww0QAz5Qce0n2nvwELJVU6froxw";

export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get API key from headers
  const apiKey = req.headers["x-api-key"] || req.headers["X-API-Key"];

  // Check if API key exists
  if (!apiKey) {
    throw new AppError("API key is required", 401);
  }

  // Validate API key
  if (apiKey !== API_KEY) {
    throw new AppError("Invalid API key", 403);
  }

  // API key is valid, continue
  next();
};

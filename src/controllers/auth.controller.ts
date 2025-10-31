import { Request, Response } from "express";
import { db } from "../db/connection";
import { usersTable, socialAccountsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { AppError } from "../middleware/error.middleware";
import { OAuth2Client } from "google-auth-library";
import { config } from "../constants/config";

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

// Generate JWT token
const generateToken = (userId: string, email: string) => {
  return jwt.sign({ id: userId, email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as SignOptions);
};

// Register with email/password
export const register = async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;
  console.log(req.body);

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  // Check if user exists
  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new AppError("Email already registered", 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const [newUser] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      displayName: fullName,
      emailVerified: false,
    })
    .returning();

  const token = generateToken(newUser.id, newUser.email);

  res.status(201).json({
    message: "User registered successfully",
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName,
      identityVerified: newUser.identityVerificationStatus === "verified",
      emailVerified: newUser.emailVerified,
    },
  });
};

// Login with email/password
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  // Find user
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Check if account is suspended
  if (user.isSuspended) {
    throw new AppError("Account is suspended", 403);
  }

  // Check status if banned
  if (!user.isActive) {
    throw new AppError("Account is inactive", 403);
  }

  // Update last login
  await db
    .update(usersTable)
    .set({
      lastLoginAt: new Date(),
      lastLoginIp: req.ip,
    })
    .where(eq(usersTable.id, user.id));

  const token = generateToken(user.id, user.email);

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      identityVerified: user.identityVerificationStatus === "verified",
    },
  });
};

// Get current user profile
export const getProfile = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Get linked social accounts
  const socialAccounts = await db
    .select({
      provider: socialAccountsTable.provider,
      providerEmail: socialAccountsTable.providerEmail,
    })
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.userId, userId));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      phoneNumber: user.phoneNumber,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      identityVerified: user.identityVerificationStatus === "verified",
      identityVerificationStatus: user.identityVerificationStatus,
      identityVerifiedAt: user.identityVerifiedAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      socialAccounts,
    },
  });
};

// Google OAuth - Exchange authorization code for user info
export const googleAuth = async (req: Request, res: Response) => {
  const { code, idToken } = req.body;

  if (!code && !idToken) {
    throw new AppError("Authorization code or ID token required", 400);
  }

  try {
    let googleUserInfo:
      | { sub: string; email: string; name?: string; picture?: string }
      | undefined;

    // If using ID token (from mobile/frontend)
    if (idToken) {
      // Verify and decode the ID token
      googleUserInfo = (await verifyGoogleIdToken(idToken)) as
        | { sub: string; email: string; name?: string; picture?: string }
        | undefined;
    } else {
      // If using authorization code (traditional OAuth flow)
      googleUserInfo = await exchangeGoogleCode(code);
    }

    if (
      !googleUserInfo ||
      typeof googleUserInfo.sub !== "string" ||
      typeof googleUserInfo.email !== "string"
    ) {
      throw new AppError("Invalid Google user info", 400);
    }

    const googleId = googleUserInfo.sub;
    const email = googleUserInfo.email;
    const name = googleUserInfo.name;
    const picture = googleUserInfo.picture;

    if (!email) {
      throw new AppError("Email not provided by Google", 400);
    }

    // Check if social account exists
    const [existingSocialAccount] = await db
      .select()
      .from(socialAccountsTable)
      .where(eq(socialAccountsTable.providerAccountId, googleId))
      .limit(1);

    let user;

    if (existingSocialAccount) {
      // User already linked Google account - get user
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, existingSocialAccount.userId))
        .limit(1);

      // Update last login
      await db
        .update(usersTable)
        .set({
          lastLoginAt: new Date(),
          lastLoginIp: req.ip,
        })
        .where(eq(usersTable.id, user.id));

      // Update social account tokens
      await db
        .update(socialAccountsTable)
        .set({
          providerEmail: email,
          providerDisplayName: name,
          providerAvatarUrl: picture,
          updatedAt: new Date(),
        })
        .where(eq(socialAccountsTable.id, existingSocialAccount.id));
    } else {
      // Check if user exists with this email
      const [existingUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (existingUser) {
        // User exists, link Google account to existing user
        await db.insert(socialAccountsTable).values({
          userId: existingUser.id,
          provider: "google",
          providerAccountId: googleId,
          providerEmail: email,
          providerDisplayName: name,
          providerAvatarUrl: picture,
        });

        user = existingUser;
      } else {
        // Create new user
        [user] = await db
          .insert(usersTable)
          .values({
            email,
            displayName: name || email.split("@")[0],
            avatarUrl: picture,
            emailVerified: true, // Google emails are verified
            passwordHash: null, // No password for OAuth users
          })
          .returning();

        // Create social account record
        await db.insert(socialAccountsTable).values({
          userId: user.id,
          provider: "google",
          providerAccountId: googleId,
          providerEmail: email,
          providerDisplayName: name,
          providerAvatarUrl: picture,
        });
      }
    }

    if (!user) {
      throw new AppError("Failed to create or retrieve user", 500);
    }

    // Check if account is suspended
    if (user.isSuspended) {
      throw new AppError("Account is suspended", 403);
    }

    // Check status if banned
    if (!user.isActive) {
      throw new AppError("Account is inactive", 403);
    }

    const token = generateToken(user.id, user.email);

    res.json({
      message: "Google authentication successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        identityVerified: user.identityVerificationStatus === "verified",
      },
    });
  } catch (error: any) {
    console.error("Google auth error:", error);
    throw new AppError(
      error.message || "Google authentication failed",
      error.statusCode || 500
    );
  }
};

// Helper: Verify Google ID Token (for mobile apps)
async function verifyGoogleIdToken(idToken: string) {
  // In production, you would verify the token with Google's API
  // For now, we'll decode it (INSECURE - use google-auth-library in production)

  // Install: npm install google-auth-library
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();

  // Temporary decode (INSECURE - replace in production!)
  // const payload = JSON.parse(
  //   Buffer.from(idToken.split(".")[1], "base64").toString()
  // );
  // return payload;
}

// Helper: Exchange authorization code for user info
async function exchangeGoogleCode(code: string) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new AppError("Google OAuth not configured", 500);
  }

  // Exchange code for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI || "postmessage",
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new AppError("Failed to exchange Google code", 400);
  }

  const tokens = await tokenResponse.json();

  // Get user info with access token
  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );

  if (!userInfoResponse.ok) {
    throw new AppError("Failed to get Google user info", 400);
  }

  const userInfo = await userInfoResponse.json();
  return {
    sub: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
  };
}

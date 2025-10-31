// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { validateApiKey } from "./middleware/apiKey.middleware";
import { Server } from "socket.io";
import http from "http";

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan("dev")); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// API Key validation for all /api routes
app.use("/api", validateApiKey);

// API Routes
app.use("/api/v1", routes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // for development; restrict in production
    methods: ["GET", "POST"],
  },
});

// Store user socket mappings
const userSockets = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // User joins with their userId
  socket.on("join", (userId: string) => {
    console.log(`User ${userId} joined with socket ${socket.id}`);
    userSockets.set(userId, socket.id);
    socket.join(userId); // Join a room with userId
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    // Remove user from mapping
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

// Export io instance to use in controllers
export { io };

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    message: "Sellio API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      user: "/api/user",
      products: "/api/products",
      offers: "/api/offers",
      categories: "/api/categories",
      categoryAttributes: "/api/category-attributes",
      messages: "/api/messages",
    },
  });
});

// Error handling
app.use(notFoundHandler); // 404 handler
app.use(errorHandler); // General error handler

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api/v1`);
});

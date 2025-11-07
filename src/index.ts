// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { validateApiKey } from "./middleware/apiKey.middleware.js";
import { Server } from "socket.io";
import http from "http";
import { handleLocationUpdate } from "./controllers/location.controller.js";
import { startCronJobs, stopCronJobs } from "./jobs/index.js";

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

  // User joins a conversation room for location sharing
  socket.on("join_conversation", (conversationId: string) => {
    console.log(`Socket ${socket.id} joined conversation room ${conversationId}`);
    socket.join(conversationId);
  });

  // User leaves a conversation room
  socket.on("leave_conversation", (conversationId: string) => {
    console.log(`Socket ${socket.id} left conversation room ${conversationId}`);
    socket.leave(conversationId);
  });

  // Handle location updates via WebSocket
  socket.on(
    "update_location",
    async (data: {
      conversationId: string;
      latitude: number;
      longitude: number;
    }) => {
      // Import location controller handler

      // Get userId from socket mapping
      let userId: string | undefined;
      for (const [uid, sid] of userSockets.entries()) {
        if (sid === socket.id) {
          userId = uid;
          break;
        }
      }

      if (!userId) {
        socket.emit("error", { message: "User not authenticated" });
        return;
      }

      try {
        await handleLocationUpdate(userId, data);
      } catch (error) {
        console.error("Error handling location update:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    }
  );

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

  // Start cron jobs
  startCronJobs();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  stopCronJobs();
  server.close(() => {
    console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  stopCronJobs();
  server.close(() => {
    console.log("HTTP server closed");
  });
});

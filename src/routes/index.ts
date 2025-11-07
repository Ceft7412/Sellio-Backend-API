import { Router } from "express";
import authRoutes from "./auth.routes.js";
import productRoutes from "./product.routes.js";
import offerRoutes from "./offer.routes.js";
import buyRoutes from "./buy.routes.js";
import bidRoutes from "./bid.routes.js";
import categoriesRoutes from "./categories.routes.js";
import categoryAttributesRoutes from "./category-attributes.routes.js";
import messageRoutes from "./message.routes.js";
import userRoutes from "./user.routes.js";
import transactionRoutes from "./transaction.routes.js";
import locationRoutes from "./location.routes.js";
import reportRoutes from "./report.routes.js";
import uploadRoutes from "./upload.routes.js";
import notificationRoutes from "./notification.routes.js";
import deviceTokenRoutes from "./deviceToken.routes.js";

const router = Router();

// Mount route modules
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoriesRoutes);
router.use("/offers", offerRoutes);
router.use("/buys", buyRoutes);
router.use("/bids", bidRoutes);
router.use("/category-attributes", categoryAttributesRoutes);
router.use("/messages", messageRoutes);
router.use("/transactions", transactionRoutes);
router.use("/location", locationRoutes);
router.use("/reports", reportRoutes);
router.use("/upload", uploadRoutes);
router.use("/notifications", notificationRoutes);
router.use("/device-tokens", deviceTokenRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;

import { Router } from "express";
import authRoutes from "./auth.routes";
import productRoutes from "./product.routes";
import offerRoutes from "./offer.routes";
import buyRoutes from "./buy.routes";
import bidRoutes from "./bid.routes";
import categoriesRoutes from "./categories.routes";
import categoryAttributesRoutes from "./category-attributes.routes";
import messageRoutes from "./message.routes";
import userRoutes from "./user.routes";
import transactionRoutes from "./transaction.routes";
import locationRoutes from "./location.routes";
import reportRoutes from "./report.routes";
import uploadRoutes from "./upload.routes";
import notificationRoutes from "./notification.routes";
import deviceTokenRoutes from "./deviceToken.routes";

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

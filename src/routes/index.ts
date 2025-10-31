import { Router } from "express";
import authRoutes from "./auth.routes";
import productRoutes from "./product.routes";
import offerRoutes from "./offer.routes";
import categoriesRoutes from "./categories.routes";
import categoryAttributesRoutes from "./category-attributes.routes";
import messageRoutes from "./message.routes";
import userRoutes from "./user.routes";
import transactionRoutes from "./transaction.routes";

const router = Router();

// Mount route modules
router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoriesRoutes);
router.use("/offers", offerRoutes);
router.use("/category-attributes", categoryAttributesRoutes);
router.use("/messages", messageRoutes);
router.use("/transactions", transactionRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;

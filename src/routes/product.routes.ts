import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getUserProducts,
  toggleFavoriteProduct,
  getUserFavorites,
  trackProductView,
  getSellerAnalytics,
} from "../controllers/product.controller.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.middleware.js";
import { uploadMultiple } from "../middleware/upload.middleware.js";

const router = Router();

// Public routes (anyone can view products)
router.get("/", optionalAuth, getProducts);
router.get("/:id", optionalAuth, getProductById);

// Protected routes (require authentication)
router.post("/", authenticateToken, uploadMultiple, createProduct);
router.put("/:id", authenticateToken, updateProduct);
router.delete("/:id", authenticateToken, deleteProduct);
router.get("/user/my-products", authenticateToken, getUserProducts);
router.get("/user/analytics", authenticateToken, getSellerAnalytics);

// Favorites routes
router.post("/:id/favorite", authenticateToken, toggleFavoriteProduct);
router.get("/user/favorites", authenticateToken, getUserFavorites);

// View tracking (optionalAuth to allow both authenticated and anonymous users)
router.post("/:productId/view", optionalAuth, trackProductView);

export default router;

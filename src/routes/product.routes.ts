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
} from "../controllers/product.controller";
import { authenticateToken, optionalAuth } from "../middleware/auth.middleware";
import { uploadMultiple } from "../middleware/upload.middleware";

const router = Router();

// Public routes (anyone can view products)
router.get("/", optionalAuth, getProducts);
router.get("/:id", optionalAuth, getProductById);

// Protected routes (require authentication)
router.post("/", authenticateToken, uploadMultiple, createProduct);
router.put("/:id", authenticateToken, updateProduct);
router.delete("/:id", authenticateToken, deleteProduct);
router.get("/user/my-products", authenticateToken, getUserProducts);

// Favorites routes
router.post("/:id/favorite", authenticateToken, toggleFavoriteProduct);
router.get("/user/favorites", authenticateToken, getUserFavorites);

export default router;

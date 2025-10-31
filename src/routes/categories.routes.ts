import { Router } from "express";
import {
  getAllCategories,
  getAllCategoriesWithoutParent,
  getAllCategoriesWithTotalProducts,
  getCategoryById,
} from "../controllers/categories.controller";

const router = Router();

// Public routes - no authentication required
// IMPORTANT: Specific routes must come BEFORE parameterized routes
router.get("/", getAllCategories);
router.get("/parent-only", getAllCategoriesWithoutParent);
router.get(
  "/getAllCategoriesWithTotalProducts",
  getAllCategoriesWithTotalProducts
);
router.get("/:id", getCategoryById);

export default router;

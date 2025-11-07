import { Router } from "express";
import { getCategoryAttributes } from "../controllers/category-attributes-controller.js";

const router = Router();

router.get("/:categoryId/:subCategoryId", getCategoryAttributes);


export default router;
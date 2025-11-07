import { request, Request, response, Response } from "express";
import { db } from "../db/connection.js";
import { categoriesTable, productsTable } from "../db/schema.js";
import { count, eq, isNull } from "drizzle-orm";
import { AppError } from "../middleware/error.middleware.js";

// Get all categories
export const getAllCategories = async (req: Request, res: Response) => {
  const categories = await db.select().from(categoriesTable);

  res.json({
    message: "Categories fetched successfully",
    categories,
  });
};

export const getAllCategoriesWithoutParent = async (req: Request, res: Response) => {
  const categories = await db.select().from(categoriesTable).where(isNull(categoriesTable.parentId));
  res.json({
    message: "Categories fetched successfully",
    categories,
  });
};

export const getAllCategoriesWithTotalProducts = async (
  req: Request,
  res: Response
) => {
  try {
    const categoriesWithCounts = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        description: categoriesTable.description,
        image_url: categoriesTable.image_url,
        parentId: categoriesTable.parentId,
        // Count products based on sub_category_id
        totalProducts: count(productsTable.id),
      })
      .from(categoriesTable)
      // LEFT JOIN on sub_category_id to count products for all categories
      .leftJoin(
        productsTable,
        eq(categoriesTable.id, productsTable.sub_category_id)
      )
      .groupBy(
        categoriesTable.id,
        categoriesTable.name,
        categoriesTable.description,
        categoriesTable.image_url,
        categoriesTable.parentId
      );

    res.json({
      message: "Categories with total products fetched successfully",
      categories: categoriesWithCounts,
    });
  } catch (error) {
    console.error("Error fetching categories with product counts:", error);
    throw new AppError("Failed to fetch categories", 500);
  }
};

// Get category by ID
export const getCategoryById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError("Category ID is required", 400);
  }

  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.id, id))
    .limit(1);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  res.json({
    message: "Category fetched successfully",
    category,
  });
};

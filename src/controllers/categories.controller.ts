import { request, Request, response, Response } from "express";
import { db } from "../db/connection";
import { categoriesTable, productsTable } from "../db/schema";
import { eq, isNull } from "drizzle-orm";
import { AppError } from "../middleware/error.middleware";

// Get all categories
export const getAllCategories = async (req: Request, res: Response) => {
  const categories = await db.select().from(categoriesTable);

  res.json({
    message: "Categories fetched successfully",
    categories,
  });
};

export const getAllCategoriesWithoutParent = async (
  req: Request,
  res: Response
) => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .where(isNull(categoriesTable.parentId));
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
    // First, get all categories
    const allCategories = await db.select().from(categoriesTable);

    // Get all products with their category and subcategory
    const allProducts = await db
      .select({
        id: productsTable.id,
        category_id: productsTable.category_id,
        sub_category_id: productsTable.sub_category_id,
      })
      .from(productsTable);

    // Count products for each category
    const categoriesWithCounts = allCategories.map((category) => {
      let totalProducts = 0;

      if (category.parentId === null) {
        // This is a parent category
        // Count products where category_id matches OR sub_category_id of any subcategory matches
        const subcategoryIds = allCategories
          .filter((cat) => cat.parentId === category.id)
          .map((cat) => cat.id);

        totalProducts = allProducts.filter(
          (product) =>
            product.category_id === category.id ||
            (product.sub_category_id &&
              subcategoryIds.includes(product.sub_category_id))
        ).length;
      } else {
        // This is a subcategory
        // Count products where sub_category_id matches
        totalProducts = allProducts.filter(
          (product) => product.sub_category_id === category.id
        ).length;
      }

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        image_url: category.image_url,
        parentId: category.parentId,
        totalProducts,
      };
    });

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

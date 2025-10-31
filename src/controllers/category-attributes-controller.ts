import { request, Request, response, Response } from "express";
import { categoryAttributesTable } from "../db/schema";
import { db } from "../db/connection";
import { and } from "drizzle-orm";
import { eq } from "drizzle-orm";


export const getCategoryAttributes = async (req: Request, res: Response) => {
  const { categoryId, subCategoryId } = req.params;

  const attributes = await db.select().from(categoryAttributesTable).where(and(eq(categoryAttributesTable.categoryId, categoryId), eq(categoryAttributesTable.subCategoryId, subCategoryId)));
  console.log("Attributes", attributes);
  res.json({
    message: "Category attributes fetched successfully",    
    attributes,
  });
};



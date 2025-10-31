import { request, Request, response, Response } from "express";
import { db } from "../db/connection";
import { productsTable, productImagesTable, usersTable, categoriesTable, reviews, productFavoritesTable } from "../db/schema";
import { eq, desc, and, avg } from "drizzle-orm";
import { AppError } from "../middleware/error.middleware";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  uploadToGCS,
  generateUniqueFileName,
} from "../services/storage.service";

// Get all products (with optional filters)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, sub_category, status, saleType, limit = "20", offset = "0" } = req.query;

    // Build query conditions
    const conditions: any[] = [];

    if (category) {
      conditions.push(eq(productsTable.category_id, category as string));
    }

    if (sub_category) {
      conditions.push(eq(productsTable.sub_category_id, sub_category as string));
    }

    if (status) {
      conditions.push(eq(productsTable.status, status as string));
    } else {
      // Default to active products only
      conditions.push(eq(productsTable.status, "active"));
    }

    if (saleType) {
      conditions.push(eq(productsTable.saleType, saleType as string));
    }

    // Fetch products with filters and join with users, parent category, and subcategory
    let query = db
      .select({
        id: productsTable.id,
        title: productsTable.title,
        description: productsTable.description,
        price: productsTable.price,
        originalPrice: productsTable.originalPrice,
        condition: productsTable.condition,
        saleType: productsTable.saleType,
        location: productsTable.location,
        category_id: productsTable.category_id,
        sub_category_id: productsTable.sub_category_id,
        status: productsTable.status,
        createdAt: productsTable.createdAt,
        minimumBid: productsTable.minimumBid,
        biddingEndsAt: productsTable.biddingEndsAt,
        // Seller information
        seller: {
          id: usersTable.id,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          verified: usersTable.identityVerifiedAt,
        },
      })
      .from(productsTable)
      .leftJoin(usersTable, eq(productsTable.sellerId, usersTable.id));

    // Apply conditions if any
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Apply pagination and ordering
    const products = await query
      .orderBy(desc(productsTable.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Fetch images and categories for each product
    const productsWithImagesAndCategories = await Promise.all(
      products.map(async (product) => {
        // Fetch images
        const images = await db
          .select()
          .from(productImagesTable)
          .where(eq(productImagesTable.productId, product.id))
          .orderBy(desc(productImagesTable.isPrimary));

        // Fetch category if exists
        let category = null;
        if (product.category_id) {
          const [cat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, product.category_id))
            .limit(1);
          category = cat ? { id: cat.id, name: cat.name, image_url: cat.image_url } : null;
        }

        // Fetch subcategory if exists
        let subCategory = null;
        if (product.sub_category_id) {
          const [subCat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, product.sub_category_id))
            .limit(1);
          subCategory = subCat ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url } : null;
        }

        return {
          ...product,
          category,
          subCategory,
          images: images.map((img) => ({
            id: img.id,
            url: img.imageUrl,
            isPrimary: img.isPrimary,
            order: img.order,
          })),
          coverImage: images.find((img) => img.isPrimary)?.imageUrl || images[0]?.imageUrl || null,
        };
      })
    );


    res.json({
      message: "Products fetched successfully",
      products: productsWithImagesAndCategories,
      count: productsWithImagesAndCategories.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error("Error getting products:", error);
    throw new AppError("Failed to get products", 500);
  }
};


// Get single product by ID
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Get userId from auth request (optional - can be undefined for non-authenticated users)
    const userId = (req as any).user?.id;

    if (!id) {
      throw new AppError("Product ID is required", 400);
    }

    // Fetch product with seller information
    const [product] = await db
      .select({
        id: productsTable.id,
        title: productsTable.title,
        description: productsTable.description,
        price: productsTable.price,
        originalPrice: productsTable.originalPrice,
        condition: productsTable.condition,
        saleType: productsTable.saleType,
        location: productsTable.location,
        category_id: productsTable.category_id,
        sub_category_id: productsTable.sub_category_id,
        status: productsTable.status,
        attributes: productsTable.attributes,
        minimumBid: productsTable.minimumBid,
        biddingEndsAt: productsTable.biddingEndsAt,
        createdAt: productsTable.createdAt,
        // Seller information
        seller: {
          id: usersTable.id,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          emailVerified: usersTable.emailVerified,
          identityVerifiedAt: usersTable.identityVerifiedAt,
        },
      })
      .from(productsTable)
      .leftJoin(usersTable, eq(productsTable.sellerId, usersTable.id))
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Check if current user has favorited this product
    let isFavorited = false;
    if (userId) {
      const [favorite] = await db
        .select()
        .from(productFavoritesTable)
        .where(
          and(
            eq(productFavoritesTable.userId, userId),
            eq(productFavoritesTable.productId, id)
          )
        )
        .limit(1);
      isFavorited = !!favorite;
    }

    // Fetch product images
    const images = await db
      .select()
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, product.id))
      .orderBy(desc(productImagesTable.isPrimary));

    // Fetch category if exists
    let category = null;
    if (product.category_id) {
      const [cat] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.category_id))
        .limit(1);
      category = cat ? { id: cat.id, name: cat.name, image_url: cat.image_url } : null;
    }

    // Fetch subcategory if exists
    let subCategory = null;
    if (product.sub_category_id) {
      const [subCat] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.sub_category_id))
        .limit(1);
      subCategory = subCat ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url } : null;
    }

    // Calculate seller's average rating
    let sellerRating = 0;
    if (product.seller?.id) {
      const [ratingResult] = await db
        .select({
          avgRating: avg(reviews.rating),
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.revieweeId, product.seller.id),
            eq(reviews.revieweeRole, "seller")
          )
        );

      // Convert to number and default to 0 if no reviews
      sellerRating = ratingResult?.avgRating
        ? parseFloat(ratingResult.avgRating as string)
        : 0;
    }

    // Format response
    const productDetails = {
      ...product,
      seller: {
        ...product.seller,
        sellerRating: parseFloat(sellerRating.toFixed(1)), // Round to 1 decimal place
      },
      category,
      subCategory,
      images: images.map((img) => ({
        id: img.id,
        url: img.imageUrl,
        isPrimary: img.isPrimary,
        order: img.order,
      })),
      coverImage: images.find((img) => img.isPrimary)?.imageUrl || images[0]?.imageUrl || null,
      isFavorited, // Add favorite status for current user
    };

    res.json({
      message: "Product fetched successfully",
      product: productDetails,
    });
  } catch (error) {
    console.error("Error getting product by ID:", error);
    throw error;
  }
};

// Create new product
export const createProduct = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const {
    title,
    description,
    category_id,
    sub_category_id,
    condition,
    price,
    originalPrice,
    saleType,
    allowOffers,
    allowBidding,
    minimumBid,
    biddingEndsAt,
    location,
    dynamicAttributes,
  } = req.body;

  // Validate required fields
  if (!title || !description || !condition || !price || !saleType) {
    throw new AppError(
      "Missing required fields: title, description, condition, price, saleType",
      400
    );
  }

  // Validate sale type
  if (!["fixed", "negotiable", "bidding"].includes(saleType)) {
    throw new AppError(
      "Invalid sale type. Must be 'fixed', 'negotiable', or 'bidding'",
      400
    );
  }

  // Validate bidding fields if sale type is bidding
  if (saleType === "bidding" && !minimumBid) {
    throw new AppError("Starting bid is required for bidding type", 400);
  }

  // Get uploaded files from multer
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    throw new AppError("At least one product image is required", 400);
  }

  if (files.length > 10) {
    throw new AppError("Maximum 10 images allowed", 400);
  }

  try {
    // Step 1: Create the product first
    const [newProduct] = await db
      .insert(productsTable)
      .values({
        sellerId: userId,
        title,
        description,
        category_id,
        sub_category_id,
        condition,
        price,
        originalPrice,
        saleType,
        allowOffers: saleType === "negotiable" || allowOffers,
        allowBidding: saleType === "bidding" || allowBidding,
        minimumBid: saleType === "bidding" ? minimumBid : null,
        biddingEndsAt: biddingEndsAt ? new Date(biddingEndsAt) : null,
        location,
        attributes: dynamicAttributes,
        status: "active",
      })
      .returning();

    // Step 2: Upload images to GCS asynchronously (don't await)
    // Process image uploads in the background
    const imageUploadPromises = files.map(async (file, index) => {
      try {
        // Generate unique filename
        const uniqueFileName = generateUniqueFileName(file.originalname);

        // Upload to GCS
        const imageUrl = await uploadToGCS(
          file.buffer,
          uniqueFileName,
          file.mimetype,
          "product_images"
        );

        // Determine if this is the primary image (first image or marked as cover)
        const isPrimary = index === 0;

        // Save image record to database
        await db.insert(productImagesTable).values({
          productId: newProduct.id,
          imageUrl,
          order: index.toString(),
          isPrimary,
        });

        console.log(`Image ${index + 1} uploaded successfully: ${imageUrl}`);
      } catch (error) {
        console.error(`Error uploading image ${index + 1}:`, error);
        // Don't throw error - just log it, so other images can continue uploading
      }
    });

    // Start uploading images in background (don't await)
    Promise.all(imageUploadPromises).catch((error) => {
      console.error("Error in image upload process:", error);
    });

    // Step 3: Return the created product immediately
    res.status(201).json({
      message: "Product created successfully. Images are being uploaded.",
      product: {
        id: newProduct.id,
        title: newProduct.title,
        description: newProduct.description,
        price: newProduct.price,
        condition: newProduct.condition,
        saleType: newProduct.saleType,
        status: newProduct.status,
        location: newProduct.location,
        sellerId: newProduct.sellerId,
        category_id: newProduct.category_id,
        sub_category_id: newProduct.sub_category_id,
        createdAt: newProduct.createdAt,
      },
      imagesUploading: files.length,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    throw new AppError("Failed to create product", 500);
  }
};

// Update product
export const updateProduct = async (req: AuthRequest, res: Response) => {
 
};

// Delete product
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  
};

// Get user's products
export const getUserProducts = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.sellerId, userId))
    .orderBy(desc(productsTable.createdAt));

  res.json({
    products,
    count: products.length,
  });
};

// Toggle favorite product (add or remove)
export const toggleFavoriteProduct = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id: productId } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  if (!productId) {
    throw new AppError("Product ID is required", 400);
  }

  try {
    // Check if product exists
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Check if already favorited
    const [existingFavorite] = await db
      .select()
      .from(productFavoritesTable)
      .where(
        and(
          eq(productFavoritesTable.userId, userId),
          eq(productFavoritesTable.productId, productId)
        )
      )
      .limit(1);

    if (existingFavorite) {
      // Remove from favorites
      await db
        .delete(productFavoritesTable)
        .where(eq(productFavoritesTable.id, existingFavorite.id));

      res.json({
        message: "Product removed from favorites",
        isFavorited: false,
      });
    } else {
      // Add to favorites
      await db.insert(productFavoritesTable).values({
        userId,
        productId,
      });

      res.json({
        message: "Product added to favorites",
        isFavorited: true,
      });
    }
  } catch (error) {
    console.error("Error toggling favorite:", error);
    throw error;
  }
};

// Get user's favorite products
export const getUserFavorites = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  try {
    // Fetch favorites with product details
    const favorites = await db
      .select({
        id: productFavoritesTable.id,
        createdAt: productFavoritesTable.createdAt,
        product: {
          id: productsTable.id,
          title: productsTable.title,
          description: productsTable.description,
          price: productsTable.price,
          originalPrice: productsTable.originalPrice,
          condition: productsTable.condition,
          saleType: productsTable.saleType,
          location: productsTable.location,
          category_id: productsTable.category_id,
          sub_category_id: productsTable.sub_category_id,
          status: productsTable.status,
          createdAt: productsTable.createdAt,
          seller: {
            id: usersTable.id,
            displayName: usersTable.displayName,
            avatarUrl: usersTable.avatarUrl,
            verified: usersTable.identityVerifiedAt,
          },
        },
      })
      .from(productFavoritesTable)
      .leftJoin(productsTable, eq(productFavoritesTable.productId, productsTable.id))
      .leftJoin(usersTable, eq(productsTable.sellerId, usersTable.id))
      .where(eq(productFavoritesTable.userId, userId))
      .orderBy(desc(productFavoritesTable.createdAt));

    // Fetch images and categories for each product
    const favoritesWithDetails = await Promise.all(
      favorites.map(async (favorite) => {
        if (!favorite.product) return null;

        // Fetch images
        const images = await db
          .select()
          .from(productImagesTable)
          .where(eq(productImagesTable.productId, favorite.product.id))
          .orderBy(desc(productImagesTable.isPrimary));

        // Fetch category if exists
        let category = null;
        if (favorite.product.category_id) {
          const [cat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, favorite.product.category_id))
            .limit(1);
          category = cat ? { id: cat.id, name: cat.name, image_url: cat.image_url } : null;
        }

        // Fetch subcategory if exists
        let subCategory = null;
        if (favorite.product.sub_category_id) {
          const [subCat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, favorite.product.sub_category_id))
            .limit(1);
          subCategory = subCat ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url } : null;
        }

        return {
          id: favorite.id,
          createdAt: favorite.createdAt,
          product: {
            ...favorite.product,
            category,
            subCategory,
            images: images.map((img) => ({
              id: img.id,
              url: img.imageUrl,
              isPrimary: img.isPrimary,
              order: img.order,
            })),
            coverImage: images.find((img) => img.isPrimary)?.imageUrl || images[0]?.imageUrl || null,
          },
        };
      })
    );

    // Filter out null entries (in case product was deleted)
    const validFavorites = favoritesWithDetails.filter((f) => f !== null);

    res.json({
      message: "Favorites fetched successfully",
      favorites: validFavorites,
      count: validFavorites.length,
    });
  } catch (error) {
    console.error("Error getting user favorites:", error);
    throw new AppError("Failed to get favorites", 500);
  }
};

import { Request, Response } from "express";
import { db } from "../db/connection.js";
import {
  productsTable,
  productImagesTable,
  usersTable,
  categoriesTable,
  reviews,
  productFavoritesTable,
  productViewsTable,
  offersTable,
  transactions,
} from "../db/schema.js";
import { eq, desc, and, avg, sql, inArray } from "drizzle-orm";
import { AppError } from "../middleware/error.middleware.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  uploadToGCS,
  generateUniqueFileName,
} from "../services/storage.service.js";
import { registerProductToBlockchain } from "../blockchain/productRegistry.js";

// Get all products (with optional filters)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      category,
      sub_category,
      status,
      saleType,
      limit = "20",
      offset = "0",
    } = req.query;

    // Build query conditions
    const conditions: any[] = [];

    if (category) {
      conditions.push(eq(productsTable.category_id, category as string));
    }

    if (sub_category) {
      conditions.push(
        eq(productsTable.sub_category_id, sub_category as string)
      );
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
          category = cat
            ? { id: cat.id, name: cat.name, image_url: cat.image_url }
            : null;
        }

        // Fetch subcategory if exists
        let subCategory = null;
        if (product.sub_category_id) {
          const [subCat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, product.sub_category_id))
            .limit(1);
          subCategory = subCat
            ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url }
            : null;
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
          coverImage:
            images.find((img) => img.isPrimary)?.imageUrl ||
            images[0]?.imageUrl ||
            null,
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
        blockchainAddress: productsTable.blockchain_address || "",
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

    // Fetch product images (all types)
    const allImages = await db
      .select()
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, product.id))
      .orderBy(desc(productImagesTable.isPrimary));

    // Separate product images and maintenance images
    const images = allImages.filter((img) => img.imageType === "product");
    const maintenanceImages = allImages.filter(
      (img) => img.imageType === "maintenance"
    );

    // Fetch category if exists
    let category = null;
    if (product.category_id) {
      const [cat] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.category_id))
        .limit(1);
      category = cat
        ? { id: cat.id, name: cat.name, image_url: cat.image_url }
        : null;
    }

    // Fetch subcategory if exists
    let subCategory = null;
    if (product.sub_category_id) {
      const [subCat] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.sub_category_id))
        .limit(1);
      subCategory = subCat
        ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url }
        : null;
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

    // Get total view count for this product
    const viewCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productViewsTable)
      .where(eq(productViewsTable.productId, id));

    const viewCount = viewCountResult[0]?.count || 0;

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
      maintenanceImages: maintenanceImages.map((img) => ({
        id: img.id,
        url: img.imageUrl,
        order: img.order,
      })),
      coverImage:
        images.find((img) => img.isPrimary)?.imageUrl ||
        images[0]?.imageUrl ||
        null,
      isFavorited, // Add favorite status for current user
      viewCount, // Add view count
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

  // Get uploaded files from multer (now supports multiple fields)
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const productImages = files?.images || [];
  const maintenanceImages = files?.maintenanceImages || [];

  if (productImages.length === 0) {
    throw new AppError("At least one product image is required", 400);
  }

  if (productImages.length > 10) {
    throw new AppError("Maximum 10 product images allowed", 400);
  }

  if (maintenanceImages.length > 10) {
    throw new AppError("Maximum 10 maintenance checklist images allowed", 400);
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
        biddingEndsAt:
          saleType === "bidding"
            ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now for bidding products
            : biddingEndsAt
            ? new Date(biddingEndsAt)
            : null,
        location,
        attributes: dynamicAttributes,
        status: "active",
      })
      .returning();

    // Step 2: Register product to blockchain (fire-and-forget)
    registerProductToBlockchain(
      newProduct.id,
      newProduct.title,
      newProduct.price,
      JSON.stringify(newProduct.attributes || {}),
      (saleType === "bidding").toString(),
      (saleType === "negotiable").toString(),
      userId,
      newProduct.createdAt.toISOString()
    ).catch((error) => {
      console.error("Error registering product to blockchain:", error);
      // Don't throw - blockchain registration is not critical for product creation
    });

    // Step 3: Upload images to GCS asynchronously (don't await)
    // Process product images
    const productImageUploadPromises = productImages.map(
      async (file, index) => {
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

          // Determine if this is the primary image (first image)
          const isPrimary = index === 0;

          // Save image record to database with imageType: 'product'
          await db.insert(productImagesTable).values({
            productId: newProduct.id,
            imageUrl,
            imageType: "product",
            order: index.toString(),
            isPrimary,
          });

          console.log(
            `Product image ${index + 1} uploaded successfully: ${imageUrl}`
          );
        } catch (error) {
          console.error(`Error uploading product image ${index + 1}:`, error);
          // Don't throw error - just log it, so other images can continue uploading
        }
      }
    );

    // Process maintenance checklist images
    const maintenanceImageUploadPromises = maintenanceImages.map(
      async (file, index) => {
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

          // Save image record to database with imageType: 'maintenance'
          await db.insert(productImagesTable).values({
            productId: newProduct.id,
            imageUrl,
            imageType: "maintenance",
            order: index.toString(),
            isPrimary: false, // Maintenance images are never primary
          });

          console.log(
            `Maintenance image ${index + 1} uploaded successfully: ${imageUrl}`
          );
        } catch (error) {
          console.error(
            `Error uploading maintenance image ${index + 1}:`,
            error
          );
          // Don't throw error - just log it, so other images can continue uploading
        }
      }
    );

    // Start uploading all images in background (don't await)
    Promise.all([
      ...productImageUploadPromises,
      ...maintenanceImageUploadPromises,
    ]).catch((error) => {
      console.error("Error in image upload process:", error);
    });

    // Step 4: Return the created product immediately
    res.status(201).json({
      message:
        "Product created successfully. Images and blockchain registration in progress.",
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
export const updateProduct = async (req: AuthRequest, res: Response) => {};

// Delete product
export const deleteProduct = async (req: AuthRequest, res: Response) => {};

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

  // Get product IDs
  const productIds = products.map((p) => p.id);

  // Fetch all product images at once
  const allProductImages =
    productIds.length > 0
      ? await db
          .select()
          .from(productImagesTable)
          .where(inArray(productImagesTable.productId, productIds))
      : [];

  // Group images by product ID
  const imagesByProduct = allProductImages.reduce((acc: any, img: any) => {
    if (!acc[img.productId]) acc[img.productId] = [];
    acc[img.productId].push(img);
    return acc;
  }, {});

  // Add coverImage to each product
  const productsWithImages = products.map((product) => {
    const images = imagesByProduct[product.id] || [];
    const coverImage =
      images.find((img: any) => img.isPrimary)?.imageUrl ||
      images[0]?.imageUrl ||
      null;

    return {
      ...product,
      coverImage,
    };
  });

  res.json({
    products: productsWithImages,
    count: productsWithImages.length,
  });
};

// Toggle favorite product (add or remove)
export const toggleFavoriteProduct = async (
  req: AuthRequest,
  res: Response
) => {
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
        favoriteId: productFavoritesTable.id,
        favoriteCreatedAt: productFavoritesTable.createdAt,

        // Product fields
        productId: productsTable.id,
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
        productCreatedAt: productsTable.createdAt,

        // Seller fields
        sellerId: usersTable.id,
        sellerDisplayName: usersTable.displayName,
        sellerAvatarUrl: usersTable.avatarUrl,
        sellerVerified: usersTable.identityVerifiedAt,
      })
      .from(productFavoritesTable)
      .leftJoin(
        productsTable,
        eq(productFavoritesTable.productId, productsTable.id)
      )
      .leftJoin(usersTable, eq(productsTable.sellerId, usersTable.id))
      .where(eq(productFavoritesTable.userId, userId))
      .orderBy(desc(productFavoritesTable.createdAt));

    // Fetch images and categories for each product
    const favoritesWithDetails = await Promise.all(
      favorites.map(async (favorite: any) => {
        if (!favorite) return null;

        // Fetch images
        const images = await db
          .select()
          .from(productImagesTable)
          .where(eq(productImagesTable.productId, favorite.productId ?? ""))
          .orderBy(desc(productImagesTable.isPrimary));

        // Fetch category if exists
        let category = null;
        if (favorite.category_id) {
          const [cat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, favorite.category_id))
            .limit(1);
          category = cat
            ? { id: cat.id, name: cat.name, image_url: cat.image_url }
            : null;
        }

        // Fetch subcategory if exists
        let subCategory = null;
        if (favorite.sub_category_id) {
          const [subCat] = await db
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, favorite.sub_category_id))
            .limit(1);
          subCategory = subCat
            ? { id: subCat.id, name: subCat.name, image_url: subCat.image_url }
            : null;
        }

        return {
          id: favorite.productId,
          createdAt: favorite.favoriteCreatedAt,
          product: {
            ...favorite,
            category,
            subCategory,
            images: images.map((img: any) => ({
              id: img.id,
              url: img.imageUrl,
              isPrimary: img.isPrimary,
              order: img.order,
            })),
            coverImage:
              images.find((img) => img.isPrimary)?.imageUrl ||
              images[0]?.imageUrl ||
              null,
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

// Track product view (only count first-time views per user)
export const trackProductView = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const userId = req.user?.id;

    if (!productId) {
      throw new AppError("Product ID is required", 400);
    }

    // Check if product exists
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // For authenticated users, check if they've already viewed this product
    if (userId) {
      const [existingView] = await db
        .select()
        .from(productViewsTable)
        .where(
          and(
            eq(productViewsTable.productId, productId),
            eq(productViewsTable.userId, userId)
          )
        )
        .limit(1);

      // If user hasn't viewed this product before, create a new view record
      if (!existingView) {
        await db.insert(productViewsTable).values({
          productId,
          userId,
        });
      }
    } else {
      // For anonymous users, always create a view record (with null userId)
      await db.insert(productViewsTable).values({
        productId,
        userId: null,
      });
    }

    // Get total view count for this product
    const viewCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productViewsTable)
      .where(eq(productViewsTable.productId, productId));

    const viewCount = viewCountResult[0]?.count || 0;

    res.status(200).json({
      message: "Product view tracked successfully",
      viewCount,
    });
  } catch (error) {
    console.error("Error tracking product view:", error);
    throw error;
  }
};

// Get seller analytics
export const getSellerAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) throw new AppError("User not authenticated", 401);

    // Get all seller's products
    const sellerProducts = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.sellerId, userId));

    const productIds = sellerProducts.map((p) => p.id);

    // Get active listings count
    const activeListings = sellerProducts.filter(
      (p) => p.status === "active"
    ).length;

    // Get total views for all products
    let totalViews = 0;
    if (productIds.length > 0) {
      const viewsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(productViewsTable)
        .where(inArray(productViewsTable.productId, productIds));
      totalViews = viewsResult[0]?.count || 0;
    }

    // Get pending offers count (offers that are pending on seller's products)
    let pendingOffers = 0;
    if (productIds.length > 0) {
      const offersResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(offersTable)
        .where(
          and(
            inArray(offersTable.productId, productIds),
            eq(offersTable.status, "pending")
          )
        );
      pendingOffers = offersResult[0]?.count || 0;
    }

    // Get active transactions count (where user is seller)
    const activeTransactionsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.sellerId, userId),
          eq(transactions.status, "active")
        )
      );
    const activeTransactions = activeTransactionsResult[0]?.count || 0;

    // Get sales data for the last 30 days (completed transactions)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesData = await db
      .select({
        completedAt: transactions.completedAt,
        agreedPrice: transactions.agreedPrice,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.sellerId, userId),
          eq(transactions.status, "completed")
        )
      );

    // Calculate total revenue and sales count
    const totalRevenue = salesData.reduce(
      (sum, sale) => sum + parseFloat(sale.agreedPrice),
      0
    );
    const totalSales = salesData.length;
    const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Group sales by date for chart
    const salesByDate: { [key: string]: number } = {};
    salesData.forEach((sale) => {
      if (sale.completedAt) {
        const date = new Date(sale.completedAt).toISOString().split("T")[0];
        salesByDate[date] =
          (salesByDate[date] || 0) + parseFloat(sale.agreedPrice);
      }
    });

    // Get product distribution by status
    const productsByStatus = {
      active: sellerProducts.filter((p) => p.status === "active").length,
      sold: sellerProducts.filter((p) => p.status === "sold").length,
      draft: sellerProducts.filter((p) => p.status === "draft").length,
      expired: sellerProducts.filter((p) => p.status === "expired").length,
    };

    // Get product distribution by category
    const categoryIds = sellerProducts
      .map((p) => p.category_id)
      .filter((id): id is string => id !== null);

    let productsByCategory: { [key: string]: { name: string; count: number } } =
      {};

    if (categoryIds.length > 0) {
      // Fetch category details
      const categories = await db
        .select()
        .from(categoriesTable)
        .where(inArray(categoriesTable.id, categoryIds));

      // Count products per category
      const categoryCounts: { [key: string]: number } = {};
      sellerProducts.forEach((product) => {
        if (product.category_id) {
          categoryCounts[product.category_id] =
            (categoryCounts[product.category_id] || 0) + 1;
        }
      });

      // Map category IDs to names and counts
      categories.forEach((category) => {
        if (categoryCounts[category.id]) {
          productsByCategory[category.id] = {
            name: category.name,
            count: categoryCounts[category.id],
          };
        }
      });
    }

    res.status(200).json({
      message: "Seller analytics fetched successfully",
      analytics: {
        activeListings,
        pendingOffers,
        activeTransactions,
        totalViews,
        totalRevenue,
        totalSales,
        avgSale,
        salesByDate,
        productsByStatus,
        productsByCategory,
      },
    });
  } catch (error) {
    console.error("Error getting seller analytics:", error);
    throw error;
  }
};

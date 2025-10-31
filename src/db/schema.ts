import { relations } from "drizzle-orm";
import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
  boolean,
  index,
  uniqueIndex,
  jsonb,
  integer,
  numeric,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Email/Password Authentication
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }), // Nullable for social auth only users
    emailVerified: boolean("email_verified").default(false).notNull(),
    emailVerifiedAt: timestamp("email_verified_at"),
    displayName: varchar("display_name", { length: 200 }),
    avatarUrl: text("avatar_url"),
    phoneNumber: varchar("phone_number", { length: 20 }),
    phoneVerified: boolean("phone_verified").default(false).notNull(),
    phoneVerifiedAt: timestamp("phone_verified_at"),

    // Identity Verification
    identityVerificationStatus: varchar("identity_verification_status", {
      length: 50,
    }).default("pending"), // 'pending', 'verified', 'rejected'
    identityVerifiedAt: timestamp("identity_verified_at"),

    // Account Status
    isActive: boolean("is_active").default(true).notNull(),
    isSuspended: boolean("is_suspended").default(false).notNull(),
    suspendedAt: timestamp("suspended_at"),
    suspensionReason: text("suspension_reason"),

    // Security
    lastLoginAt: timestamp("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }), // IPv6 compatible
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    twoFactorSecret: varchar("two_factor_secret", { length: 255 }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
  })
);

// Separate table for social accounts - allows multiple providers per user
export const socialAccountsTable = pgTable(
  "social_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    // Provider Information
    provider: varchar("provider", { length: 50 }).notNull(), // 'google', 'facebook', 'github', 'apple', etc.
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(), // Unique ID from the provider
    providerEmail: varchar("provider_email", { length: 255 }),
    providerDisplayName: varchar("provider_display_name", { length: 200 }),
    providerAvatarUrl: text("provider_avatar_url"),

    // OAuth Tokens (for API access if needed)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    scope: text("scope"), // OAuth scopes granted

    // Metadata
    rawProfile: text("raw_profile"), // Store full provider profile as JSON if needed

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("social_accounts_user_id_idx").on(table.userId),
    providerIdx: index("social_accounts_provider_idx").on(table.provider),
    // Ensure one account per provider per user
    uniqueProviderAccount: uniqueIndex("unique_provider_account_idx").on(
      table.provider,
      table.providerAccountId
    ),
  })
);

// ============================================================================
// MARKETPLACE TABLES
// ============================================================================

// Products/Listings
export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    // Product Details
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    category_id: uuid("category_id").references(() => categoriesTable.id),
    sub_category_id: uuid("sub_category_id").references(
      () => categoriesTable.id
    ),
    blockchain_address: text("blockchain_address"),
    condition: varchar("condition", { length: 50 }).notNull(), // 'new', 'like_new', 'good', 'fair', 'poor'
    attributes: jsonb("attributes"),

    // Pricing
    price: varchar("price", { length: 20 }).notNull(), // Store as string to avoid float issues
    originalPrice: varchar("original_price", { length: 20 }), // For showing discount

    // Sale Type
    saleType: varchar("sale_type", { length: 50 }).notNull(), // 'buy_now', 'offers', 'bidding'
    allowOffers: boolean("allow_offers").default(false).notNull(),
    allowBidding: boolean("allow_bidding").default(false).notNull(),

    // Bidding specific
    minimumBid: varchar("minimum_bid", { length: 20 }),
    biddingEndsAt: timestamp("bidding_ends_at"),

    // Location
    location: varchar("location", { length: 255 }),
    // Status
    status: varchar("status", { length: 50 }).default("active").notNull(), // 'draft', 'active', 'sold', 'expired', 'removed'
    soldAt: timestamp("sold_at"),
    soldTo: uuid("sold_to").references(() => usersTable.id),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sellerIdIdx: index("products_seller_id_idx").on(table.sellerId),
    categoryIdx: index("products_category_idx").on(table.category_id),
    subCategoryIdx: index("products_sub_category_idx").on(
      table.sub_category_id
    ),
    statusIdx: index("products_status_idx").on(table.status),
    saleTypeIdx: index("products_sale_type_idx").on(table.saleType),
  })
);

export const productFavoritesTable = pgTable(
  "product_favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => usersTable.id),
    productId: uuid("product_id").references(() => productsTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("product_favorites_user_id_idx").on(table.userId),
    productIdIdx: index("product_favorites_product_id_idx").on(table.productId),
  })
);

export const productViewsTable = pgTable(
  "product_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => usersTable.id),
    productId: uuid("product_id").references(() => productsTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("product_views_user_id_idx").on(table.userId),
    productIdIdx: index("product_views_product_id_idx").on(table.productId),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    // Primary key
    id: uuid("id").defaultRandom().primaryKey(),
    reference_number: text("reference_number"),
    blockchainTxHash: text("blockchain_tx_hash"),

    // Related entities (one of offerId or buyId should be present)
    offerId: uuid("offer_id").references(() => offersTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    buyId: uuid("buy_id").references(() => buysTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    bidId: uuid("bid_id").references(() => bidsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    // Transaction details
    agreedPrice: numeric("agreed_price", { precision: 10, scale: 2 }).notNull(),
    originalPrice: numeric("original_price", {
      precision: 10,
      scale: 2,
    }).notNull(), // Product's listed price at time of transaction

    // Status tracking
    status: varchar("status", { length: 50 }).notNull().default("active"), // active, completed, cancelled_by_buyer, cancelled_by_seller, expired

    // Payment information
    paymentStatus: varchar("payment_status", { length: 50 }).default("pending"), // pending, completed, failed

    // Meetup coordination
    meetupStatus: varchar("meetup_status", { length: 50 }).default(
      "not_scheduled"
    ), // not_scheduled, scheduled, confirmed, completed, cancelled
    meetupLocation: text("meetup_location"),
    meetupCoordinates: jsonb("meetup_coordinates"), // { lat, lng, address }
    scheduledMeetupAt: timestamp("scheduled_meetup_at"),
    meetupProposedBy: uuid("meetup_proposed_by").references(() => usersTable.id),

    // Transaction lifecycle
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    expiresAt: timestamp("expires_at"), // Auto-expire transactions after certain period

    // Cancellation details
    cancellationReason: text("cancellation_reason"),
    cancelledBy: uuid("cancelled_by").references(() => usersTable.id),

    // Completion confirmation
    buyerConfirmedCompletion: boolean("buyer_confirmed_completion").default(
      false
    ),
    sellerConfirmedCompletion: boolean("seller_confirmed_completion").default(
      false
    ),

    // Communication
    lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),

    // Audit trail
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Indexes for performance
    buyerIdIdx: index("transactions_buyer_id_idx").on(table.buyerId),
    sellerIdIdx: index("transactions_seller_id_idx").on(table.sellerId),
    productIdIdx: index("transactions_product_id_idx").on(table.productId),
    offerIdIdx: index("transactions_offer_id_idx").on(table.offerId),
    buyIdIdx: index("transactions_buy_id_idx").on(table.buyId),
    statusIdx: index("transactions_status_idx").on(table.status),
    createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
    meetupStatusIdx: index("transactions_meetup_status_idx").on(
      table.meetupStatus
    ),
    expiresAtIdx: index("transactions_expires_at_idx").on(table.expiresAt),
  })
);

export const reviews = pgTable(
  "reviews",
  {
    // Primary key
    id: uuid("id").defaultRandom().primaryKey(),
    blockchainTxHash: text("blockchain_tx_hash"),

    // Related entities
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    revieweeId: uuid("reviewee_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    // Review content
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull(), // 1.0 to 5.0
    reviewText: text("review_text").notNull(),

    // Role context (who is reviewing whom)
    reviewerRole: varchar("reviewer_role", { length: 20 }).notNull(), // 'buyer' or 'seller'
    revieweeRole: varchar("reviewee_role", { length: 20 }).notNull(), // 'buyer' or 'seller'

    // Response to review
    response: text("response"), // Reviewee can respond to the review
    respondedAt: timestamp("responded_at"),

    // Verification
    isVerifiedTransaction: boolean("is_verified_transaction").default(true),

    // Privacy
    isAnonymous: boolean("is_anonymous").default(false), // If true, reviewer name/avatar hidden in public display

    // Audit trail
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Indexes for performance
    transactionIdIdx: index("reviews_transaction_id_idx").on(
      table.transactionId
    ),
    reviewerIdIdx: index("reviews_reviewer_id_idx").on(table.reviewerId),
    revieweeIdIdx: index("reviews_reviewee_id_idx").on(table.revieweeId),
    ratingIdx: index("reviews_rating_idx").on(table.rating),
    createdAtIdx: index("reviews_created_at_idx").on(table.createdAt),
    revieweeRoleIdx: index("reviews_reviewee_role_idx").on(table.revieweeRole),
    // Composite index for getting user's reviews by role
    revieweeRoleCompositeIdx: index("reviews_reviewee_role_composite_idx").on(
      table.revieweeId,
      table.revieweeRole
    ),
    // Ensure one review per reviewer per transaction
    uniqueReviewIdx: index("reviews_unique_review_idx").on(
      table.transactionId,
      table.reviewerId
    ),
  })
);

export const reviewImages = pgTable(
  "review_images",
  {
    // Primary key
    id: uuid("id").defaultRandom().primaryKey(),

    // Related review
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    gcsUrl: text("gcs_url").notNull(), // Google Cloud Storage URL

    // Display order
    sortOrder: integer("sort_order").notNull().default(0),

    // Audit trail
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Indexes
    reviewIdIdx: index("review_images_review_id_idx").on(table.reviewId),
    sortOrderIdx: index("review_images_sort_order_idx").on(table.sortOrder),
  })
);

export const categoriesTable = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),

    image_url: text("image_url"),

    parentId: uuid("parent_id"), // For sub-categories

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("categories_name_idx").on(table.name),
    parentIdIdx: index("categories_parent_id_idx").on(table.parentId),
  })
);

export const categoriesRelations = relations(categoriesTable, ({ one }) => ({
  parent: one(categoriesTable, {
    fields: [categoriesTable.parentId],
    references: [categoriesTable.id],
  }),
}));

export const categoryAttributesTable = pgTable("category_attributes", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categoriesTable.id, { onDelete: "cascade" }),
  subCategoryId: uuid("sub_category_id").references(() => categoriesTable.id, {
    onDelete: "cascade",
  }),
  attributeKey: varchar("attribute_key", { length: 100 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  validation: jsonb("validation"),
  helpText: text("help_text"),
  options: jsonb("options"),
  placeholder: varchar("placeholder", { length: 100 }),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Imagess
export const productImagesTable = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),

    imageUrl: text("image_url").notNull(),
    order: varchar("order", { length: 10 }).notNull(), // Display order
    isPrimary: boolean("is_primary").default(false).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("product_images_product_id_idx").on(table.productId),
  })
);

// Offers (for products that allow offers)
export const offersTable = pgTable(
  "offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    offerAmount: varchar("offer_amount", { length: 20 }).notNull(),

    status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'accepted', 'rejected', 'expired', 'withdrawn'

    expiresAt: timestamp("expires_at"), // Optional expiration
    respondedAt: timestamp("responded_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("offers_product_id_idx").on(table.productId),
    buyerIdIdx: index("offers_buyer_id_idx").on(table.buyerId),
    sellerIdIdx: index("offers_seller_id_idx").on(table.sellerId),
    statusIdx: index("offers_status_idx").on(table.status),
  })
);

export const buysTable = pgTable(
  "buys",
  {
    // Primary key
    id: uuid("id").defaultRandom().primaryKey(),

    // Related entities
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => usersTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    // Purchase details
    purchasePrice: numeric("purchase_price", {
      precision: 10,
      scale: 2,
    }).notNull(), // Final agreed price
    originalPrice: numeric("original_price", {
      precision: 10,
      scale: 2,
    }).notNull(), // Product's listed price at time of purchase

    // Status tracking
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    // pending, confirmed_pending_meetup, cancelled_by_buyer, cancelled_by_seller, expired

    // Additional metadata
    metadata: jsonb("metadata"), // Flexible storage for additional buy-specific data

    // Audit trail
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Indexes for performance
    productIdIdx: index("buys_product_id_idx").on(table.productId),
    buyerIdIdx: index("buys_buyer_id_idx").on(table.buyerId),
    sellerIdIdx: index("buys_seller_id_idx").on(table.sellerId),
    statusIdx: index("buys_status_idx").on(table.status),
    createdAtIdx: index("buys_created_at_idx").on(table.createdAt),

    // Composite indexes for common queries
    productStatusIdx: index("buys_product_status_idx").on(
      table.productId,
      table.status
    ),
    sellerPendingIdx: index("buys_seller_pending_idx").on(
      table.sellerId,
      table.status
    ),
    buyerStatusIdx: index("buys_buyer_status_idx").on(
      table.buyerId,
      table.status
    ),
  })
);

// Bids (for auction-style listings)
export const bidsTable = pgTable(
  "bids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    bidderId: uuid("bidder_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    bidAmount: varchar("bid_amount", { length: 20 }).notNull(),

    status: varchar("status", { length: 50 }).default("active").notNull(), // 'active', 'outbid', 'won', 'lost'

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("bids_product_id_idx").on(table.productId),
    bidderIdIdx: index("bids_bidder_id_idx").on(table.bidderId),
    statusIdx: index("bids_status_idx").on(table.status),
  })
);

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // 'active', 'read', 'archived'
  type: varchar("type", { length: 50 }).notNull(), // 'bid', 'offer', 'buy', 'transaction', 'system', 'favorite', 'order', 'message'
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversations (messaging between users)
export const conversationsTable = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Related to product, offer, bid, or transaction
    productId: uuid("product_id").references(() => productsTable.id, {
      onDelete: "cascade",
    }),
    offerId: uuid("offer_id").references(() => offersTable.id),
    bidId: uuid("bid_id").references(() => bidsTable.id),
    buyId: uuid("buy_id").references(() => buysTable.id),
    transactionId: uuid("transaction_id").references(() => transactions.id),

    // Participants (buyer and seller)
    participant1Id: uuid("participant1_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    participant2Id: uuid("participant2_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    lastMessageAt: timestamp("last_message_at"),
    preview: text("preview"),
    status: varchar("status", { length: 50 }).default("active").notNull(), // 'active', 'archived', 'blocked'

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("conversations_product_id_idx").on(table.productId),
    participant1Idx: index("conversations_participant1_idx").on(
      table.participant1Id
    ),
    participant2Idx: index("conversations_participant2_idx").on(
      table.participant2Id
    ),
  })
);

// Messages
export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    content: text("content").notNull(),
    messageType: varchar("message_type", { length: 50 })
      .default("text")
      .notNull(), // 'text', 'image', 'location'
    imageUrl: text("image_url"), // URL for image messages

    // Read status
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index("messages_conversation_id_idx").on(
      table.conversationId
    ),
    senderIdIdx: index("messages_sender_id_idx").on(table.senderId),
  })
);

// Location Sharing Sessions (real-time location sharing between users in a conversation)
export const locationSharingSessionsTable = pgTable(
  "location_sharing_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),

    // Who is sharing their location
    participant1Sharing: boolean("participant1_sharing")
      .default(false)
      .notNull(),
    participant2Sharing: boolean("participant2_sharing")
      .default(false)
      .notNull(),

    // When they started/stopped sharing
    participant1StartedAt: timestamp("participant1_started_at"),
    participant1StoppedAt: timestamp("participant1_stopped_at"),
    participant2StartedAt: timestamp("participant2_started_at"),
    participant2StoppedAt: timestamp("participant2_stopped_at"),

    // Session status
    status: varchar("status", { length: 50 }).default("active").notNull(), // 'active', 'ended'

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index("location_sessions_conversation_id_idx").on(
      table.conversationId
    ),
    statusIdx: index("location_sessions_status_idx").on(table.status),
  })
);

// Location Updates (actual location points during sharing)
export const locationUpdatesTable = pgTable(
  "location_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => locationSharingSessionsTable.id, {
        onDelete: "cascade",
      }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    // Real-time location data
    latitude: varchar("latitude", { length: 50 }).notNull(),
    longitude: varchar("longitude", { length: 50 }).notNull(),
    distance: varchar("distance", { length: 20 }), // In meters from last update
    accuracy: varchar("accuracy", { length: 20 }), // In meters
    heading: varchar("heading", { length: 10 }), // Direction of movement (0-360 degrees)
    speed: varchar("speed", { length: 20 }), // In m/s

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index("location_updates_session_id_idx").on(table.sessionId),
    userIdIdx: index("location_updates_user_id_idx").on(table.userId),
    createdAtIdx: index("location_updates_created_at_idx").on(table.createdAt), // For querying recent locations
  })
);

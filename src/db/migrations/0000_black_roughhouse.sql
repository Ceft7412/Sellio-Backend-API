CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"bidder_id" uuid NOT NULL,
	"bid_amount" varchar(20) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"purchase_price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"image_url" text,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"sub_category_id" uuid,
	"attribute_key" varchar(100) NOT NULL,
	"label" varchar(100) NOT NULL,
	"type" varchar(100) NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"validation" jsonb,
	"help_text" text,
	"options" jsonb,
	"placeholder" varchar(100),
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"offer_id" uuid,
	"bid_id" uuid,
	"buy_id" uuid,
	"transaction_id" uuid,
	"participant1_id" uuid NOT NULL,
	"participant2_id" uuid NOT NULL,
	"last_message_at" timestamp,
	"preview" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_sharing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"participant1_sharing" boolean DEFAULT false NOT NULL,
	"participant2_sharing" boolean DEFAULT false NOT NULL,
	"participant1_started_at" timestamp,
	"participant1_stopped_at" timestamp,
	"participant2_started_at" timestamp,
	"participant2_stopped_at" timestamp,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"latitude" varchar(50) NOT NULL,
	"longitude" varchar(50) NOT NULL,
	"distance" varchar(20),
	"accuracy" varchar(20),
	"heading" varchar(10),
	"speed" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar(50) DEFAULT 'text' NOT NULL,
	"image_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"type" varchar(50) NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"offer_amount" varchar(20) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"product_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"order" varchar(10) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"product_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"sub_category_id" uuid,
	"blockchain_address" text,
	"condition" varchar(50) NOT NULL,
	"attributes" jsonb,
	"price" varchar(20) NOT NULL,
	"original_price" varchar(20),
	"sale_type" varchar(50) NOT NULL,
	"allow_offers" boolean DEFAULT false NOT NULL,
	"allow_bidding" boolean DEFAULT false NOT NULL,
	"minimum_bid" varchar(20),
	"bidding_ends_at" timestamp,
	"location" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"sold_at" timestamp,
	"sold_to" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"gcs_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blockchain_tx_hash" text,
	"transaction_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"rating" numeric(2, 1) NOT NULL,
	"review_text" text NOT NULL,
	"reviewer_role" varchar(20) NOT NULL,
	"reviewee_role" varchar(20) NOT NULL,
	"response" text,
	"responded_at" timestamp,
	"is_verified_transaction" boolean DEFAULT true,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"provider_email" varchar(255),
	"provider_display_name" varchar(200),
	"provider_avatar_url" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scope" text,
	"raw_profile" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_number" text,
	"blockchain_tx_hash" text,
	"offer_id" uuid,
	"buy_id" uuid,
	"bid_id" uuid,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"agreed_price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"payment_status" varchar(50) DEFAULT 'pending',
	"meetup_status" varchar(50) DEFAULT 'not_scheduled',
	"meetup_location" text,
	"meetup_coordinates" jsonb,
	"scheduled_meetup_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"expires_at" timestamp,
	"cancellation_reason" text,
	"cancelled_by" uuid,
	"buyer_confirmed_completion" boolean DEFAULT false,
	"seller_confirmed_completion" boolean DEFAULT false,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp,
	"display_name" varchar(200),
	"avatar_url" text,
	"phone_number" varchar(20),
	"phone_verified" boolean DEFAULT false NOT NULL,
	"phone_verified_at" timestamp,
	"identity_verification_status" varchar(50) DEFAULT 'pending',
	"identity_verified_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"last_login_at" timestamp,
	"last_login_ip" varchar(45),
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buys" ADD CONSTRAINT "buys_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "buys" ADD CONSTRAINT "buys_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "buys" ADD CONSTRAINT "buys_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_sub_category_id_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buy_id_buys_id_fk" FOREIGN KEY ("buy_id") REFERENCES "public"."buys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant2_id_users_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_sharing_sessions" ADD CONSTRAINT "location_sharing_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_updates" ADD CONSTRAINT "location_updates_session_id_location_sharing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."location_sharing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_updates" ADD CONSTRAINT "location_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_favorites" ADD CONSTRAINT "product_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_favorites" ADD CONSTRAINT "product_favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sold_to_users_id_fk" FOREIGN KEY ("sold_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buy_id_buys_id_fk" FOREIGN KEY ("buy_id") REFERENCES "public"."buys"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bids_product_id_idx" ON "bids" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "bids_bidder_id_idx" ON "bids" USING btree ("bidder_id");--> statement-breakpoint
CREATE INDEX "bids_status_idx" ON "bids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "buys_product_id_idx" ON "buys" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "buys_buyer_id_idx" ON "buys" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "buys_seller_id_idx" ON "buys" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "buys_status_idx" ON "buys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "buys_created_at_idx" ON "buys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "buys_product_status_idx" ON "buys" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "buys_seller_pending_idx" ON "buys" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "buys_buyer_status_idx" ON "buys" USING btree ("buyer_id","status");--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "conversations_product_id_idx" ON "conversations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "conversations_participant1_idx" ON "conversations" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "conversations_participant2_idx" ON "conversations" USING btree ("participant2_id");--> statement-breakpoint
CREATE INDEX "location_sessions_conversation_id_idx" ON "location_sharing_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "location_sessions_status_idx" ON "location_sharing_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "location_updates_session_id_idx" ON "location_updates" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "location_updates_user_id_idx" ON "location_updates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_updates_created_at_idx" ON "location_updates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "offers_product_id_idx" ON "offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "offers_buyer_id_idx" ON "offers" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "offers_seller_id_idx" ON "offers" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_favorites_user_id_idx" ON "product_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_favorites_product_id_idx" ON "product_favorites" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_views_user_id_idx" ON "product_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_views_product_id_idx" ON "product_views" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_seller_id_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_sub_category_idx" ON "products" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_sale_type_idx" ON "products" USING btree ("sale_type");--> statement-breakpoint
CREATE INDEX "review_images_review_id_idx" ON "review_images" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_images_sort_order_idx" ON "review_images" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "reviews_transaction_id_idx" ON "reviews" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_id_idx" ON "reviews" USING btree ("reviewee_id");--> statement-breakpoint
CREATE INDEX "reviews_rating_idx" ON "reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_role_idx" ON "reviews" USING btree ("reviewee_role");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_role_composite_idx" ON "reviews" USING btree ("reviewee_id","reviewee_role");--> statement-breakpoint
CREATE INDEX "reviews_unique_review_idx" ON "reviews" USING btree ("transaction_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "social_accounts_user_id_idx" ON "social_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_accounts_provider_idx" ON "social_accounts" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_provider_account_idx" ON "social_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "transactions_buyer_id_idx" ON "transactions" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "transactions_seller_id_idx" ON "transactions" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "transactions_product_id_idx" ON "transactions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "transactions_offer_id_idx" ON "transactions" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "transactions_buy_id_idx" ON "transactions" USING btree ("buy_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transactions_meetup_status_idx" ON "transactions" USING btree ("meetup_status");--> statement-breakpoint
CREATE INDEX "transactions_expires_at_idx" ON "transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_idx" ON "users" USING btree ("email");
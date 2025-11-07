ALTER TABLE "notifications" ADD COLUMN "image_url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "route_name" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "route_params" text;
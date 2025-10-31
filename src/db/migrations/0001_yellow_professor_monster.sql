ALTER TABLE "messages" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();
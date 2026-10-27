ALTER TABLE "procurement" ADD COLUMN "supervisor_token_hash" text;
ALTER TABLE "procurement" ADD COLUMN "supervisor_token_expires_at" timestamp with time zone;
ALTER TABLE "portal" ADD COLUMN "owner_staff_id" uuid REFERENCES "staff"("id");
ALTER TABLE "portal" ADD COLUMN "last_review_on" date;
ALTER TABLE "retention_location" ADD COLUMN "owner_staff_id" uuid REFERENCES "staff"("id");

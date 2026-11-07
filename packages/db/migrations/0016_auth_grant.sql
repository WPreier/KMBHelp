ALTER TABLE "staff" ADD COLUMN "helpdesk" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "staff" SET "helpdesk" = true WHERE "is_local_admin" = false;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "renewed_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "session" SET "renewed_at" = "created_at";
--> statement-breakpoint
CREATE TABLE "qr_login" (
  "token" text PRIMARY KEY,
  "expires_at" timestamp with time zone NOT NULL,
  "session_id" uuid REFERENCES "session"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

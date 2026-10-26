CREATE TABLE "notice_setting" (
	"code" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_setting_category" CHECK ("notice_setting"."category" in ('informational', 'warning', 'error'))
);

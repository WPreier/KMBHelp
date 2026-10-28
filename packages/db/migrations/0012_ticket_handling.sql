ALTER TABLE "ticket" ADD COLUMN "explanation" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "satisfaction" text;
--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_satisfaction" CHECK ("ticket"."satisfaction" is null or "ticket"."satisfaction" in ('satisfied', 'neutral', 'dissatisfied'));
--> statement-breakpoint
CREATE TABLE "mail_lesson" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "internet_message_id" text NOT NULL,
  "outcome" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_lesson_outcome" CHECK ("mail_lesson"."outcome" in ('accepted', 'rejected')),
  CONSTRAINT "mail_lesson_internet_message_id_unique" UNIQUE("internet_message_id")
);

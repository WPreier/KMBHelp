CREATE TABLE "staff_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_id" uuid NOT NULL,
	"query_hash" text NOT NULL,
	"sentence_de" text NOT NULL,
	"sentence_en" text NOT NULL,
	"hit_ids" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_search" ADD CONSTRAINT "staff_search_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
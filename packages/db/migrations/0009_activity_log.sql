CREATE TABLE "activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor" text NOT NULL,
  "kind" text NOT NULL,
  "target" text NOT NULL,
  "detail" text NOT NULL,
  "ip" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_log_at_idx" ON "activity_log" USING btree ("at");

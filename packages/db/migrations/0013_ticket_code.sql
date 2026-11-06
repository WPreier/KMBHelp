ALTER TABLE "ticket" ADD COLUMN "code" text;
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    EXTRACT(YEAR FROM timezone('Europe/Vienna', created_at))::int AS year,
    row_number() OVER (
      PARTITION BY EXTRACT(YEAR FROM timezone('Europe/Vienna', created_at))
      ORDER BY number
    ) AS n
  FROM ticket
)
UPDATE ticket AS target
SET code = lpad((ranked.year % 100)::text, 2, '0') || '-' || lpad(ranked.n::text, 4, '0')
FROM ranked
WHERE target.id = ranked.id AND ranked.n <= 9999;
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "code" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "code" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_code_unique" UNIQUE("code");
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "summary" text;
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "verdict" text;
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "working_markdown" text;
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "close_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "ticket_code_counter" (
  "year" integer PRIMARY KEY NOT NULL,
  "last_value" integer NOT NULL
);
--> statement-breakpoint
INSERT INTO "ticket_code_counter" ("year", "last_value")
SELECT EXTRACT(YEAR FROM timezone('Europe/Vienna', created_at))::int, COUNT(*)::int
FROM ticket
GROUP BY 1;
--> statement-breakpoint
CREATE TABLE "ticket_file" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "name" text NOT NULL,
  "media_type" text NOT NULL,
  "content_base64" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_file" ADD CONSTRAINT "ticket_file_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ticket_file_ticket_idx" ON "ticket_file" USING btree ("ticket_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assign_ticket_code() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  yy integer;
  seq integer;
BEGIN
  IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
    RETURN NEW;
  END IF;
  yy := EXTRACT(YEAR FROM timezone('Europe/Vienna', now()))::int;
  INSERT INTO ticket_code_counter (year, last_value)
  VALUES (yy, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = ticket_code_counter.last_value + 1
    WHERE ticket_code_counter.last_value < 9999
  RETURNING last_value INTO seq;
  IF seq IS NULL THEN
    RAISE EXCEPTION 'ticket code range exhausted for %', yy;
  END IF;
  NEW.code := lpad((yy % 100)::text, 2, '0') || '-' || lpad(seq::text, 4, '0');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_assign_code ON ticket;
--> statement-breakpoint
CREATE TRIGGER ticket_assign_code
  BEFORE INSERT ON ticket
  FOR EACH ROW
  EXECUTE FUNCTION assign_ticket_code();

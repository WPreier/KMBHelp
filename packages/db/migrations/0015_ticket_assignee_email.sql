ALTER TABLE "ticket" ADD COLUMN "assignee_email" text;
--> statement-breakpoint
UPDATE "ticket" AS t
SET "assignee_email" = COALESCE(
  (
    SELECT NULLIF(btrim(s.email), '')
    FROM "staff" AS s
    WHERE s.id = t.assigned_staff_id
  ),
  'helpdesk@kmbcloud.at'
)
WHERE "assignee_email" IS NULL OR btrim("assignee_email") = '';
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "assignee_email" SET DEFAULT 'helpdesk@kmbcloud.at';
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "assignee_email" SET NOT NULL;

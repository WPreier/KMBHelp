ALTER TABLE "ticket_event" DISABLE TRIGGER "ticket_event_append_only";
--> statement-breakpoint
ALTER TABLE "login_audit" DISABLE TRIGGER "login_audit_append_only";
--> statement-breakpoint
UPDATE "ticket" SET "assigned_staff_id" = null WHERE "assigned_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "ticket_event" SET "actor_staff_id" = null WHERE "actor_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "supplier" SET "approved_by_staff_id" = null WHERE "approved_by_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "certificate" SET "owner_staff_id" = null WHERE "owner_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "portal" SET "owner_staff_id" = null WHERE "owner_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "retention_location" SET "owner_staff_id" = null WHERE "owner_staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
UPDATE "login_audit" SET "staff_id" = null WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "login_audit" WHERE lower("email") = 'automation@kmbhelp.invalid';
--> statement-breakpoint
DELETE FROM "staff_skill" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "staff_category" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "session" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "webauthn_credential" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "webauthn_challenge" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "staff_search" WHERE "staff_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
DELETE FROM "activity_log" WHERE lower("actor") IN ('automation', 'automation@kmbhelp.invalid');
--> statement-breakpoint
DELETE FROM "staff" WHERE "id" = '00000000-0000-4000-8000-000000000001' OR lower("email") = 'automation@kmbhelp.invalid';
--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_role";
--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_role" CHECK ("staff"."role" in ('agent', 'lead', 'admin'));
--> statement-breakpoint
ALTER TABLE "ticket_event" ENABLE TRIGGER "ticket_event_append_only";
--> statement-breakpoint
ALTER TABLE "login_audit" ENABLE TRIGGER "login_audit_append_only";

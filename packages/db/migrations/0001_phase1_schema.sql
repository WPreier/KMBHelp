CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"ticket_id" uuid,
	"user_agent" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"serial_number" text,
	"owner_name" text NOT NULL,
	"location" text,
	"encryption" text DEFAULT 'unknown' NOT NULL,
	"issued_on" date,
	"returned_on" date,
	CONSTRAINT "asset_encryption" CHECK ("asset"."encryption" in ('yes', 'no', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "backup_test_detail" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"system_name" text NOT NULL,
	"backup_taken_on" date,
	"restored" boolean,
	"restored_to" text,
	"result_text" text,
	"duration_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"code" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category_code" text NOT NULL,
	"skill_code" text NOT NULL,
	"label_de" text NOT NULL,
	"label_en" text NOT NULL,
	"target_minutes" integer NOT NULL,
	"checklist" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"code" text PRIMARY KEY NOT NULL,
	"group_code" text NOT NULL,
	"label_de" text NOT NULL,
	"label_en" text NOT NULL,
	"default_skill_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_name" text NOT NULL,
	"expires_on" date NOT NULL,
	"owner_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "change_detail" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"fallback_text" text,
	"systems" text,
	"touches_freeze" boolean DEFAULT false NOT NULL,
	"exception_reason" text,
	"outcome" text,
	CONSTRAINT "change_outcome" CHECK ("change_detail"."outcome" is null or "change_detail"."outcome" in ('done', 'rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "change_freeze" (
	"code" text PRIMARY KEY NOT NULL,
	"day_of_month_from" integer,
	"day_of_month_to" integer,
	"weekdays_only" boolean DEFAULT true NOT NULL,
	"on_date" date,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_article" (
	"slug" text PRIMARY KEY NOT NULL,
	"title_de" text NOT NULL,
	"title_en" text NOT NULL,
	"body_de" text DEFAULT '' NOT NULL,
	"body_en" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"redacted" boolean DEFAULT false NOT NULL,
	"source_ticket_id" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "knowledge_status" CHECK ("knowledge_article"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" text NOT NULL,
	"seats" integer NOT NULL,
	"expires_on" date,
	"evidence_ref" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_name" text NOT NULL,
	"mfa" boolean NOT NULL,
	"owner_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"article" text NOT NULL,
	"reason" text NOT NULL,
	"amount_net" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"supplier_id" uuid,
	"wanted_on" date,
	"supervisor_email" text,
	"route" text NOT NULL,
	"decided_by_email" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "procurement_route" CHECK ("procurement"."route" in ('direct', 'token', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "procurement_policy" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"direct_below" numeric(12, 2) DEFAULT '100.00' NOT NULL,
	"token_until" numeric(12, 2) DEFAULT '500.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_support_detail" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"account_name" text,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"data_kind" text NOT NULL,
	"retention_label" text NOT NULL,
	"backups_follow_same_period" boolean NOT NULL,
	"last_review_on" date
);
--> statement-breakpoint
CREATE TABLE "security_incident_detail" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"isolated" boolean,
	"management_informed_name" text,
	"management_informed_at" timestamp with time zone,
	"privacy_informed_name" text,
	"privacy_informed_at" timestamp with time zone,
	"client_notice" text,
	CONSTRAINT "security_client_notice" CHECK ("security_incident_detail"."client_notice" is null or "security_incident_detail"."client_notice" in ('yes', 'no', 'open'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"code" text PRIMARY KEY NOT NULL,
	"label_de" text NOT NULL,
	"label_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_local_admin" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"ad_object_id" text,
	"mfa_enrolled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email"),
	CONSTRAINT "staff_role" CHECK ("staff"."role" in ('agent', 'lead', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "staff_skill" (
	"staff_id" uuid NOT NULL,
	"skill_code" text NOT NULL,
	CONSTRAINT "staff_skill_staff_id_skill_code_pk" PRIMARY KEY("staff_id","skill_code")
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"country_code" text NOT NULL,
	"avv_on" date,
	"confidentiality_on" date,
	"subprocessors_known" boolean NOT NULL,
	"subprocessors_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by_staff_id" uuid,
	"approved_at" timestamp with time zone,
	"record_ref" text,
	CONSTRAINT "supplier_status" CHECK ("supplier"."status" in ('draft', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"category_code" text NOT NULL,
	"catalog_code" text,
	"status" text DEFAULT 'open' NOT NULL,
	"impact" text NOT NULL,
	"priority" text NOT NULL,
	"priority_reason" text NOT NULL,
	"source" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"requester_email" text,
	"requester_name" text,
	"due_on" date,
	"assigned_staff_id" uuid,
	"internet_message_id" text,
	"secret_token" text,
	"effort_minutes" integer,
	"resolution" text,
	"knowledge_needed" boolean DEFAULT false NOT NULL,
	"access_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "ticket_number_unique" UNIQUE("number"),
	CONSTRAINT "ticket_internet_message_id_unique" UNIQUE("internet_message_id"),
	CONSTRAINT "ticket_secret_token_unique" UNIQUE("secret_token"),
	CONSTRAINT "ticket_impact" CHECK ("ticket"."impact" in ('filing', 'payroll', 'workplace', 'cosmetic')),
	CONSTRAINT "ticket_priority" CHECK ("ticket"."priority" in ('p1', 'p2', 'p3')),
	CONSTRAINT "ticket_status" CHECK ("ticket"."status" in ('open', 'in_progress', 'waiting_approval', 'manual', 'closed')),
	CONSTRAINT "ticket_source" CHECK ("ticket"."source" in ('mail', 'web', 'app', 'phone', 'walkin', 'api'))
);
--> statement-breakpoint
CREATE TABLE "ticket_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_staff_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid,
	"challenge" text NOT NULL,
	"kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "webauthn_kind" CHECK ("webauthn_challenge"."kind" in ('registration', 'authentication'))
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_test_detail" ADD CONSTRAINT "backup_test_detail_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_category_code_category_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."category"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_skill_code_skill_code_fk" FOREIGN KEY ("skill_code") REFERENCES "public"."skill"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_default_skill_code_skill_code_fk" FOREIGN KEY ("default_skill_code") REFERENCES "public"."skill"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_detail" ADD CONSTRAINT "change_detail_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article" ADD CONSTRAINT "knowledge_article_source_ticket_id_ticket_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement" ADD CONSTRAINT "procurement_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement" ADD CONSTRAINT "procurement_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_support_detail" ADD CONSTRAINT "remote_support_detail_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_support_detail" ADD CONSTRAINT "remote_support_detail_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incident_detail" ADD CONSTRAINT "security_incident_detail_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_skill" ADD CONSTRAINT "staff_skill_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_skill" ADD CONSTRAINT "staff_skill_skill_code_skill_code_fk" FOREIGN KEY ("skill_code") REFERENCES "public"."skill"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_approved_by_staff_id_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_category_code_category_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."category"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_catalog_code_catalog_item_code_fk" FOREIGN KEY ("catalog_code") REFERENCES "public"."catalog_item"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenge" ADD CONSTRAINT "webauthn_challenge_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_at_idx" ON "access_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "ticket_status_idx" ON "ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_priority_idx" ON "ticket" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "ticket_due_on_idx" ON "ticket" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "ticket_event_ticket_idx" ON "ticket_event" USING btree ("ticket_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION kmbhelp_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ticket_event_append_only
  BEFORE UPDATE OR DELETE ON ticket_event
  FOR EACH ROW EXECUTE FUNCTION kmbhelp_reject_mutation();
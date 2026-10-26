CREATE TABLE "login_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_id" uuid,
	"email" text NOT NULL,
	"method" text NOT NULL,
	"outcome" text NOT NULL,
	"ip" text NOT NULL,
	CONSTRAINT "login_audit_method" CHECK ("login_audit"."method" in ('ad_password', 'local_password', 'totp', 'webauthn', 'admin')),
	CONSTRAINT "login_audit_outcome" CHECK ("login_audit"."outcome" in ('ok', 'denied', 'not_member', 'mfa_reset'))
);
--> statement-breakpoint
CREATE TABLE "staff_category" (
	"staff_id" uuid NOT NULL,
	"category_code" text NOT NULL,
	CONSTRAINT "staff_category_staff_id_category_code_pk" PRIMARY KEY("staff_id","category_code")
);
--> statement-breakpoint
CREATE TABLE "webauthn_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webauthn_credential_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "mfa_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "csrf_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_cipher" text;--> statement-breakpoint
ALTER TABLE "login_audit" ADD CONSTRAINT "login_audit_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_category" ADD CONSTRAINT "staff_category_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_category" ADD CONSTRAINT "staff_category_category_code_category_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."category"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credential" ADD CONSTRAINT "webauthn_credential_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_username_unique" UNIQUE("username");--> statement-breakpoint
CREATE TRIGGER login_audit_append_only
  BEFORE UPDATE OR DELETE ON login_audit
  FOR EACH ROW EXECUTE FUNCTION kmbhelp_reject_mutation();
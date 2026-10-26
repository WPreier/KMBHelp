CREATE OR REPLACE FUNCTION kmbhelp_reject_login_audit_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only';
  END IF;
  IF NEW.staff_id IS NULL
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.at IS NOT DISTINCT FROM OLD.at
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.method IS NOT DISTINCT FROM OLD.method
    AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
    AND NEW.ip IS NOT DISTINCT FROM OLD.ip
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER login_audit_append_only ON login_audit;
--> statement-breakpoint
CREATE TRIGGER login_audit_append_only
  BEFORE UPDATE OR DELETE ON login_audit
  FOR EACH ROW EXECUTE FUNCTION kmbhelp_reject_login_audit_change();
--> statement-breakpoint
ALTER TABLE "login_audit" DROP CONSTRAINT "login_audit_staff_id_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "login_audit" ADD CONSTRAINT "login_audit_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;

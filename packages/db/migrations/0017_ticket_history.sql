CREATE TABLE "ticket_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ticket_history_ticket_idx" ON "ticket_history" USING btree ("ticket_id","at");
--> statement-breakpoint
CREATE TRIGGER ticket_history_append_only
  BEFORE UPDATE OR DELETE ON ticket_history
  FOR EACH ROW EXECUTE FUNCTION kmbhelp_reject_mutation();

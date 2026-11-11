ALTER TABLE "mail_lesson" DROP CONSTRAINT "mail_lesson_outcome";
--> statement-breakpoint
ALTER TABLE "mail_lesson" ADD CONSTRAINT "mail_lesson_outcome" CHECK ("mail_lesson"."outcome" in ('accepted', 'rejected', 'ignored'));

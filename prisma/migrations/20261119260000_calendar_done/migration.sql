-- Marking a calendar entry done keeps the record but stops it filling the day.

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN "done_at" TIMESTAMP(3);

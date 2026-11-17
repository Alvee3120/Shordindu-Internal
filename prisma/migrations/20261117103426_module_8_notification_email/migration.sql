-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "emailed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_emailed_at_idx" ON "notifications"("emailed_at");

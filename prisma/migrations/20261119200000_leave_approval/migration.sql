-- Leave becomes a request/approval flow: category, reason, status and decider.

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('sick', 'paid', 'unpaid', 'other');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('Pending', 'Approved', 'Rejected');

-- AlterTable
ALTER TABLE "leaves"
ADD COLUMN     "category" "LeaveCategory" NOT NULL DEFAULT 'paid',
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "LeaveStatus" NOT NULL DEFAULT 'Pending',
ADD COLUMN     "decided_by" TEXT,
ADD COLUMN     "decided_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leaves_status_idx" ON "leaves"("status");

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing rows predate the approval flow, so grandfather them as approved by
-- whoever marked them. Keeps today's "on leave" behaviour intact.
UPDATE "leaves"
SET "status" = 'Approved',
    "decided_by" = "created_by",
    "decided_at" = "created_at",
    "reason" = 'Marked before the approval flow existed';

-- Drop the temporary default now that existing rows are filled in.
ALTER TABLE "leaves" ALTER COLUMN "reason" DROP DEFAULT;

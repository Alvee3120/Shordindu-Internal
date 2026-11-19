-- Leave categories were removed; the reason carries the context instead.

-- AlterTable
ALTER TABLE "leaves" DROP COLUMN "category";

-- DropEnum
DROP TYPE "LeaveCategory";

-- Chat polls need to learn about edits and deletions, not just new messages.
-- `updated_at` moves whenever a row changes (Prisma @updatedAt), so the client
-- can ask "what changed since <time>".

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "chat_messages_updated_at_idx" ON "chat_messages"("updated_at");

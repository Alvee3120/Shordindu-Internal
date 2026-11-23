-- Reply-to for group chat: a message may point at the message it answers.
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_id" text;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_reply_to_id_fkey"
  FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "chat_messages_reply_to_id_idx" ON "chat_messages"("reply_to_id");

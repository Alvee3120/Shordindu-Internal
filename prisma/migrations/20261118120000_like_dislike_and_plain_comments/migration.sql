-- Reactions become a single like/dislike choice per person per target.

-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('like', 'dislike');

-- Keep only the earliest reaction per person and target, since the old model
-- allowed several emojis at once.
DELETE FROM "reactions" r
USING "reactions" keep
WHERE r."target_type" = keep."target_type"
  AND r."target_id" = keep."target_id"
  AND r."user_id" = keep."user_id"
  AND (r."created_at" > keep."created_at"
       OR (r."created_at" = keep."created_at" AND r."id" > keep."id"));

-- AlterTable. Dropping "emoji" also drops the unique index that used it.
ALTER TABLE "reactions" DROP COLUMN "emoji",
ADD COLUMN     "kind" "ReactionKind" NOT NULL DEFAULT 'like';

ALTER TABLE "reactions" ALTER COLUMN "kind" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "reactions_target_type_target_id_user_id_key" ON "reactions"("target_type", "target_id", "user_id");

-- Comments are plain text now. Strip the stored markup and decode the
-- entities the editor produced.
ALTER TABLE "comments" RENAME COLUMN "content_html" TO "content";

UPDATE "comments"
SET "content" = btrim(
  regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(regexp_replace("content", '<[^>]*>', ' ', 'g'), '&nbsp;', ' '),
            '&amp;', '&'),
          '&lt;', '<'),
        '&gt;', '>'),
      '&quot;', '"'),
    '&#39;', ''''),
    '\s+', ' ', 'g')
);

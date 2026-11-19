-- Profile pictures: only the stored filename lives here. The resized image
-- itself sits in the upload directory, keeping the database light.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar_file" TEXT;

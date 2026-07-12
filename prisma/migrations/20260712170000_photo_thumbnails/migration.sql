ALTER TYPE "UploadPurpose" ADD VALUE 'PHOTO_THUMBNAIL';

ALTER TABLE "photos"
  ADD COLUMN "thumbnail_object_key" TEXT,
  ADD COLUMN "thumbnail_mime_type" TEXT,
  ADD COLUMN "thumbnail_byte_size" INTEGER,
  ADD COLUMN "thumbnail_checksum" TEXT;

CREATE UNIQUE INDEX "photos_thumbnail_object_key_key" ON "photos"("thumbnail_object_key");

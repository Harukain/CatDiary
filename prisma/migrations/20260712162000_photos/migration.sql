CREATE TYPE "PhotoStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "UploadPurpose" AS ENUM ('PHOTO', 'PET_AVATAR', 'RECORD_ATTACHMENT');

CREATE TABLE "upload_intents" (
  "id" UUID NOT NULL,
  "family_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "purpose" "UploadPurpose" NOT NULL,
  "token_hash" TEXT,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "photos" (
  "id" UUID NOT NULL,
  "family_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "note" TEXT,
  "status" "PhotoStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "photo_pets" (
  "photo_id" UUID NOT NULL,
  "pet_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_pets_pkey" PRIMARY KEY ("photo_id", "pet_id")
);

CREATE TABLE "photo_records" (
  "photo_id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_records_pkey" PRIMARY KEY ("photo_id", "record_id")
);

CREATE UNIQUE INDEX "upload_intents_object_key_key" ON "upload_intents"("object_key");
CREATE INDEX "upload_intents_family_id_expires_at_idx" ON "upload_intents"("family_id", "expires_at");
CREATE INDEX "upload_intents_user_id_expires_at_idx" ON "upload_intents"("user_id", "expires_at");
CREATE UNIQUE INDEX "photos_object_key_key" ON "photos"("object_key");
CREATE INDEX "photos_family_id_status_created_at_idx" ON "photos"("family_id", "status", "created_at" DESC);
CREATE INDEX "photo_pets_pet_id_created_at_idx" ON "photo_pets"("pet_id", "created_at" DESC);
CREATE INDEX "photo_records_record_id_idx" ON "photo_records"("record_id");

ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photos" ADD CONSTRAINT "photos_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photos" ADD CONSTRAINT "photos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photo_pets" ADD CONSTRAINT "photo_pets_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_pets" ADD CONSTRAINT "photo_pets_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_records" ADD CONSTRAINT "photo_records_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_records" ADD CONSTRAINT "photo_records_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

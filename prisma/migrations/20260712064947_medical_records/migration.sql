-- CreateEnum
CREATE TYPE "MedicalRecordType" AS ENUM ('VACCINE', 'DEWORMING', 'MEDICATION');

-- CreateTable
CREATE TABLE "medical_records" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "type" "MedicalRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "brand" TEXT,
    "batch_number" TEXT,
    "dose" TEXT,
    "provider" TEXT,
    "next_due_at" TIMESTAMPTZ(3),
    "reaction" TEXT,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_records_family_id_occurred_at_idx" ON "medical_records"("family_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "medical_records_pet_id_type_occurred_at_idx" ON "medical_records"("pet_id", "type", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

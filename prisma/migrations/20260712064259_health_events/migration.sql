-- CreateEnum
CREATE TYPE "HealthEventStatus" AS ENUM ('ACTIVE', 'RECOVERED');

-- CreateEnum
CREATE TYPE "HealthEventRelationType" AS ENUM ('SYMPTOM', 'OBSERVATION', 'TREATMENT');

-- CreateTable
CREATE TABLE "health_events" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "HealthEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "recovered_at" TIMESTAMPTZ(3),
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "health_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_event_records" (
    "health_event_id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "relation_type" "HealthEventRelationType" NOT NULL DEFAULT 'OBSERVATION',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_event_records_pkey" PRIMARY KEY ("health_event_id","record_id")
);

-- CreateIndex
CREATE INDEX "health_events_family_id_status_started_at_idx" ON "health_events"("family_id", "status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "health_events_pet_id_status_started_at_idx" ON "health_events"("pet_id", "status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "health_event_records_record_id_idx" ON "health_event_records"("record_id");

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_event_records" ADD CONSTRAINT "health_event_records_health_event_id_fkey" FOREIGN KEY ("health_event_id") REFERENCES "health_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_event_records" ADD CONSTRAINT "health_event_records_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

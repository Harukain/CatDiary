CREATE TYPE "ExportScope" AS ENUM ('FAMILY', 'PERSONAL');
CREATE TYPE "ExportFormat" AS ENUM ('JSON', 'CSV');
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');
CREATE TABLE "export_jobs" (
  "id" UUID NOT NULL, "family_id" UUID NOT NULL, "requested_by_id" UUID NOT NULL,
  "scope" "ExportScope" NOT NULL, "format" "ExportFormat" NOT NULL,
  "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED', "object_key" TEXT,
  "mime_type" TEXT, "byte_size" INTEGER, "checksum" TEXT, "error_code" TEXT,
  "download_token_hash" TEXT, "download_token_expires_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3), "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "export_jobs_family_id_created_at_idx" ON "export_jobs"("family_id", "created_at" DESC);
CREATE INDEX "export_jobs_requested_by_id_created_at_idx" ON "export_jobs"("requested_by_id", "created_at" DESC);
CREATE INDEX "export_jobs_status_expires_at_idx" ON "export_jobs"("status", "expires_at");
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

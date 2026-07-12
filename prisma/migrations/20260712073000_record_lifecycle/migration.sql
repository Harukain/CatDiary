-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'REVERSED', 'DELETED');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'TASK');

-- AlterTable
ALTER TABLE "records" ADD COLUMN     "abnormal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "client_id" TEXT NOT NULL,
ADD COLUMN     "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "title" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "records_family_id_client_id_key" ON "records"("family_id", "client_id");

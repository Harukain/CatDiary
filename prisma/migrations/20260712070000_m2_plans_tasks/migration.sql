-- DropIndex
DROP INDEX "plans_family_id_active_idx";

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "active",
ADD COLUMN     "assignee_id" UUID,
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "detail" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "end_at" TIMESTAMPTZ(3),
ADD COLUMN     "local_time" TEXT NOT NULL,
ADD COLUMN     "overdue_policy" JSONB,
ADD COLUMN     "start_at" TIMESTAMPTZ(3) NOT NULL,
DROP COLUMN "recurrence_rule",
ADD COLUMN     "recurrence_rule" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_by_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "detail" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "type" "RecordType" NOT NULL;

-- CreateIndex
CREATE INDEX "plans_family_id_enabled_idx" ON "plans"("family_id", "enabled");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

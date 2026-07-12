-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_family_id_fkey";

-- DropForeignKey
ALTER TABLE "pets" DROP CONSTRAINT "pets_family_id_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_family_id_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_pet_id_fkey";

-- DropForeignKey
ALTER TABLE "records" DROP CONSTRAINT "records_family_id_fkey";

-- DropForeignKey
ALTER TABLE "records" DROP CONSTRAINT "records_pet_id_fkey";

-- DropForeignKey
ALTER TABLE "records" DROP CONSTRAINT "records_task_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_family_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_pet_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_plan_id_fkey";

-- AlterTable
ALTER TABLE "families" DROP CONSTRAINT "families_pkey",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "families_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "family_id",
ADD COLUMN     "family_id" UUID NOT NULL,
ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "pets" DROP CONSTRAINT "pets_pkey",
ADD COLUMN     "chip_number" TEXT,
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "neutered" BOOLEAN,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "family_id",
ADD COLUMN     "family_id" UUID NOT NULL,
ADD CONSTRAINT "pets_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "plans" DROP CONSTRAINT "plans_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "family_id",
ADD COLUMN     "family_id" UUID NOT NULL,
DROP COLUMN "pet_id",
ADD COLUMN     "pet_id" UUID,
ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "records" DROP CONSTRAINT "records_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "family_id",
ADD COLUMN     "family_id" UUID NOT NULL,
DROP COLUMN "pet_id",
ADD COLUMN     "pet_id" UUID,
DROP COLUMN "task_id",
ADD COLUMN     "task_id" UUID,
ADD CONSTRAINT "records_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "family_id",
ADD COLUMN     "family_id" UUID NOT NULL,
DROP COLUMN "pet_id",
ADD COLUMN     "pet_id" UUID,
DROP COLUMN "plan_id",
ADD COLUMN     "plan_id" UUID,
ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_family_id_user_id_key" ON "memberships"("family_id", "user_id");

-- CreateIndex
CREATE INDEX "pets_family_id_deleted_at_idx" ON "pets"("family_id", "deleted_at");

-- CreateIndex
CREATE INDEX "plans_family_id_active_idx" ON "plans"("family_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "records_task_id_key" ON "records"("task_id");

-- CreateIndex
CREATE INDEX "records_family_id_occurred_at_idx" ON "records"("family_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "records_pet_id_type_occurred_at_idx" ON "records"("pet_id", "type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_family_id_status_scheduled_at_idx" ON "tasks"("family_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_plan_id_scheduled_at_key" ON "tasks"("plan_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

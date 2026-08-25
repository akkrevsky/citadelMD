-- AlterTable
ALTER TABLE "folders" ADD COLUMN "owner_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "folders_owner_id_key" ON "folders"("owner_id");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

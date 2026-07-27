-- CreateEnum
CREATE TYPE "FolderMode" AS ENUM ('GIT', 'SNAPSHOT');

-- AlterTable
ALTER TABLE "folders" ADD COLUMN "mode" "FolderMode" NOT NULL DEFAULT 'GIT';

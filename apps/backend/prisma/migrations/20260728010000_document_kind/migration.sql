-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('MARKDOWN', 'EXCALIDRAW');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "kind" "DocumentKind" NOT NULL DEFAULT 'MARKDOWN';

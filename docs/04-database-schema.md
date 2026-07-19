# 04 — Схема базы данных

> Postgres 16 + Prisma ORM.
> v3 от 2026-07-19: метаданные только (без content_md, без sshPublicKey). Git — source of truth контента.

---

## 1. Общая структура

База данных = **только метаданные**. Контент `.md` файлов живёт в Git-репозитории на FS (`/var/lib/md-collab/docs/`).

| Зона | Таблицы |
|---|---|
| **Пользователи** | users |
| **Дерево документов** | folders, documents |
| **Права** | folder_permissions |
| **Публичный доступ** | shares |
| **Attachments** | uploads, user_quotas |

Yjs-сессии не персистятся в БД (ephemeral, init из working tree).

---

## 2. Prisma schema

> Файл: `apps/backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// =============== Пользователи ===============

enum UserRole {
  ADMIN
  EDITOR
  VIEWER
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  login        String   @unique
  passwordHash String   @map("password_hash")
  role         UserRole @default(VIEWER)
  displayName  String?  @map("display_name")
  gitName      String?  @map("git_name")     // для GIT_AUTHOR_NAME
  gitEmail     String?  @map("git_email")    // для GIT_AUTHOR_EMAIL
  apiKey       String?  @unique @map("api_key") // для MCP server и API доступа
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  documents         Document[]
  folderPermissions FolderPermission[]
  shares            Share[]
  uploads           Upload[]
  quota             UserQuota?

  @@map("users")
}

// =============== Папки ===============

model Folder {
  id          String    @id @default(uuid()) @db.Uuid
  parentId    String?   @map("parent_id") @db.Uuid
  parent      Folder?   @relation("FolderHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children    Folder[]  @relation("FolderHierarchy")
  name        String
  gitPath     String    @map("git_path")
  createdAt   DateTime  @default(now()) @map("created_at")
  createdById String?   @map("created_by") @db.Uuid
  createdBy   User?     @relation(fields: [createdById], references: [id])

  documents   Document[]
  permissions FolderPermission[]

  @@unique([parentId, name])
  @@index([parentId])
  @@map("folders")
}

enum FolderPermissionLevel {
  VIEW
  EDIT
  ADMIN
}

model FolderPermission {
  folderId   String               @map("folder_id") @db.Uuid
  userId     String               @map("user_id") @db.Uuid
  permission FolderPermissionLevel

  folder     Folder               @relation(fields: [folderId], references: [id], onDelete: Cascade)
  user       User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime             @default(now()) @map("created_at")

  @@id([folderId, userId])
  @@index([userId])
  @@map("folder_permissions")
}

// =============== Документы ===============

model Document {
  id          String   @id @default(uuid()) @db.Uuid
  folderId    String   @map("folder_id") @db.Uuid
  folder      Folder   @relation(fields: [folderId], references: [id], onDelete: Cascade)
  title       String
  filePath    String   @map("file_path")   // UNIQUE — путь в Git-репо
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by") @db.Uuid
  createdBy   User?    @relation(fields: [createdById], references: [id])

  shares      Share[]
  uploads     Upload[]

  @@unique([filePath])
  @@unique([folderId, title])
  @@index([folderId])
  @@index([updatedAt])
  @@map("documents")
}

// =============== Share-ссылки ===============

enum SharePermission {
  READ
  WRITE
}

model Share {
  token       String          @id @db.VarChar(32)
  documentId  String          @map("document_id") @db.Uuid
  document    Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)
  permission  SharePermission
  createdById String?         @map("created_by") @db.Uuid
  createdBy   User?           @relation(fields: [createdById], references: [id])
  expiresAt   DateTime        @map("expires_at")
  createdAt   DateTime        @default(now()) @map("created_at")

  @@index([documentId])
  @@index([expiresAt])
  @@map("shares")
}

// =============== Uploads ===============

model Upload {
  id          String   @id @default(uuid()) @db.Uuid
  documentId  String   @map("document_id") @db.Uuid
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  objectKey   String   @map("object_key")
  fileName    String   @map("file_name")
  mimeType    String   @map("mime_type")
  sizeBytes   Int      @map("size_bytes")
  createdById String?  @map("created_by") @db.Uuid
  createdBy   User?    @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([documentId])
  @@index([createdById])
  @@map("uploads")
}

// =============== Квоты ===============

model UserQuota {
  userId           String   @id @map("user_id") @db.Uuid
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  maxStorageBytes  Int      @default(5368709120) @map("max_storage_bytes") // 5 GB
  usedStorageBytes Int      @default(0) @map("used_storage_bytes")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("user_quotas")
}
```

---

## 3. Изменения от предыдущей версии

| Что | v2 | v3 |
|---|---|---|
| `Document.contentMd` | — | ❌ (уже удалено в v2) |
| `User.sshPublicKey` | Добавлено в v2 | ❌ Удалено (нет SSH-доступа) |
| `User.apiKey` | Не было | ✅ Добавлено (для MCP server auth) |
| `User.gitName / gitEmail` | Добавлено в v2 | ✅ Оставлено (для GIT_AUTHOR_*) |
| Yjs persistence | — | ❌ Ephemeral |

---

## 4. Индексы

| Индекс | Назначение |
|---|---|
| `folders(parent_id)` | Список подпапок |
| `folders(parent_id, name)` UNIQUE | Нет дубликатов имён |
| `documents(folder_id)` | Документы в папке |
| `documents(file_path)` UNIQUE | Один документ → один файл |
| `documents(updated_at)` | Недавно изменённые |
| `folder_permissions(user_id)` | Доступные папки |
| `users(api_key)` UNIQUE | MCP server auth |
| `shares(token)` PK | Поиск share-ссылки |
| `shares(expires_at)` | Фоновая чистка |
| `uploads(document_id)` | Вложения документа |
| `uploads(created_by_id)` | Подсчёт квоты |

---

## 5. Политики удаления

| Сценарий | Действие |
|---|---|
| Удаление пользователя | `active = false` (soft). Документы и Git-история остаются. |
| Удаление папки | Каскад + `git rm -r <git_path>` + commit |
| Удаление документа | Каскад shares/uploads + `git rm <file_path>` + commit + Yjs purge |
| Истёкшая share-ссылка | Фоновая job удаляет ночью |

---

## 6. Миграции

- Prisma migrations (`prisma migrate dev` — локально, `prisma migrate deploy` — прод).
- Backend-контейнер: `npx prisma migrate deploy && node dist/index.js`.

---

## 7. Seed

```typescript
// apps/backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 12)
  await prisma.user.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      login: 'admin',
      passwordHash,
      role: 'ADMIN',
      displayName: 'Administrator',
      gitName: 'Administrator',
      gitEmail: 'admin@mdcollab.local',
      apiKey: crypto.randomBytes(32).toString('hex'),
    },
  })
  // Корневая папка
  await prisma.folder.upsert({
    where: { parentId_name: { parentId: '', name: 'Root' } },
    update: {},
    create: { name: 'Root', gitPath: '', parentId: null },
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

---

## 8. Бэкапы

- **Postgres:** ежедневный `pg_dump --format=custom`, retention 7 дней.
- **Git-репозиторий:** periodic push в mirror remote (каждые 6 часов).
- **MinIO:** `mc mirror` раз в неделю (опционально).

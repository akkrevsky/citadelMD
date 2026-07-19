# 05 — API контракты

> REST API + WebSocket протокол + **MCP server tools**.
> v3 от 2026-07-19: web-only, ручной commit/discard/restore, добавлен MCP server.

---

## 1. Конвенции

### 1.1. HTTP-коды

| Код | Значение |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (например, одновременный commit) |
| 413 | Payload Too Large |
| 422 | Unprocessable Entity (Git operation failed) |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

### 1.2. Формат ошибок

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Документ не существует или у вас нет к нему доступа"
  }
}
```

### 1.3. Пагинация

- Query: `?limit=50&offset=0`
- Ответ: `{ data: [...], total: 1234, limit: 50, offset: 0 }`

---

## 2. Auth

### POST `/api/auth/login`

```json
{ "login": "ivan", "password": "secret" }
```

**200:**
```json
{
  "user": { "id": "uuid", "login": "ivan", "role": "EDITOR", "displayName": "Иван Петров" },
  "expiresAt": "2026-07-26T12:00:00Z"
}
```

Cookie: `token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`

Rate limit: **5 попыток/мин/IP**.

---

### POST `/api/auth/logout` → 204

### GET `/api/auth/me` → `{ user: { id, login, role, displayName } }`

### PATCH `/api/auth/me/password`

```json
{ "currentPassword": "old", "newPassword": "new" }
```

Минимум 10 символов, 1 цифра, не равен логину.

---

## 3. Users (admin-only)

### GET `/api/users`

```json
{
  "data": [
    {
      "id": "uuid",
      "login": "ivan",
      "role": "EDITOR",
      "displayName": "Иван Петров",
      "gitName": "Ivan Petrov",
      "gitEmail": "ivan@mdcollab.local",
      "apiKey": "hex-string-or-null",
      "active": true,
      "createdAt": "..."
    }
  ],
  "total": 10
}
```

---

### POST `/api/users`

```json
{
  "login": "maria",
  "password": "initialPassword10",
  "role": "EDITOR",
  "displayName": "Мария",
  "gitName": "Maria Petrova",
  "gitEmail": "maria@mdcollab.local"
}
```

**201**. API key генерируется автоматически. **409** — login занят.

---

### PATCH `/api/users/:id`

```json
{
  "role": "VIEWER",
  "displayName": "Новое имя",
  "active": false,
  "password": "newPassword",
  "gitName": "New Name",
  "regenerateApiKey": true
}
```

---

### DELETE `/api/users/:id`

Деактивирует (`active=false`). **204**. **409** — нельзя (есть документы).

---

## 4. Folders

### GET `/api/tree`

Дерево доступных папок с документами.

```json
{
  "tree": [
    {
      "id": "uuid",
      "name": "Legal",
      "permission": "ADMIN",
      "children": [],
      "documents": [
        {
          "id": "uuid",
          "title": "NDA template",
          "filePath": "Legal/Contracts/NDA.md",
          "updatedAt": "..."
        }
      ]
    }
  ]
}
```

---

### POST `/api/folders`

```json
{ "parentId": "uuid-or-null", "name": "Marketing" }
```

Backend: создаёт папку в Git + INSERT. **201**.

---

### PATCH `/api/folders/:id`

```json
{ "name": "Новое имя" }
```

`git mv <old> <new>` + commit. **200**.

---

### DELETE `/api/folders/:id`

`git rm -r <git_path>` + commit. **204**.

---

### GET / PUT `/api/folders/:id/permissions`

```json
{
  "permissions": [
    { "userId": "uuid", "login": "ivan", "permission": "EDIT" },
    { "userId": "uuid", "login": "maria", "permission": "VIEW" }
  ]
}
```

---

## 5. Documents

### POST `/api/folders/:folderId/documents`

```json
{ "title": "Project kickoff" }
```

Backend: создаёт файл в Git + **первый commit** + INSERT. **201**:

```json
{
  "document": {
    "id": "uuid",
    "folderId": "uuid",
    "title": "Project kickoff",
    "filePath": "Marketing/project-kickoff.md",
    "createdAt": "...",
    "updatedAt": "...",
    "createdBy": "ivan"
  }
}
```

---

### GET `/api/documents/:id`

Метаданные. Контент не возвращается (он в Git/Yjs).

```json
{
  "document": {
    "id": "uuid",
    "title": "...",
    "filePath": "...",
    "permission": "EDIT",
    "hasUncommittedChanges": true
  }
}
```

---

### GET `/api/documents/:id/export`

Чистый markdown из Git **working tree** (с незакоммиченными правками).

**200** `Content-Type: text/markdown; charset=utf-8`.

---

### PATCH `/api/documents/:id`

Только `title`. `git mv` + commit. **200**.

---

### DELETE `/api/documents/:id`

`git rm <file>` + commit + Yjs purge. **204**.

---

## 6. Версионность (commit / discard / restore / diff)

### POST `/api/documents/:id/commit`

Создать новую версию. editor/admin only.

```json
{ "message": "Добавить секцию про конфиденциальность" }
```

Backend:
1. Redis lock на file_path
2. POST yjs-server `/internal/flush?docid=...`
3. `git add <file_path>`
4. Если нет изменений → 200 `{ message: "no changes" }`
5. `git commit -m "<message> [user:<login>]"`
6. Release lock

**200:**
```json
{
  "sha": "a1b2c3d",
  "message": "Добавить секцию про конфиденциальность [user:ivan]",
  "author": { "name": "Ivan Petrov", "email": "ivan@mdcollab.local" },
  "date": "2026-07-19T14:23:00Z"
}
```

**409** — lock занят (другой commit в процессе).

---

### POST `/api/documents/:id/discard`

Откатить незакоммиченные правки к HEAD. editor/admin only.

```json
{}
```

Backend:
1. Redis lock
2. `git checkout HEAD -- <file_path>`
3. POST yjs-server `/internal/reload?docid=...`
4. Release lock

**200:** `{ ok: true }`

---

### GET `/api/documents/:id/diff`

Незакоммиченные изменения (working tree vs HEAD).

```
git diff HEAD -- <file_path>
```

**200:**
```json
{
  "hasUncommittedChanges": true,
  "diff": "diff --git a/Marketing/kickoff.md b/Marketing/kickoff.md\n-old line\n+new line"
}
```

---

### GET `/api/documents/:id/revisions`

История коммитов файла.

Query: `from`, `to` (ISO dates), `limit` (default 100, max 500), `offset`.

**200:**
```json
{
  "revisions": [
    {
      "sha": "a1b2c3d4e5f6...",
      "shortSha": "a1b2c3d",
      "author": { "name": "Ivan Petrov", "email": "ivan@mdcollab.local" },
      "date": "2026-07-19T14:23:00Z",
      "message": "Добавить секцию [user:ivan]"
    }
  ],
  "hasMore": false
}
```

---

### GET `/api/documents/:id/revisions/:sha`

Содержимое файла на конкретную ревизию (`git show <sha>:<file_path>`).

**200:**
```json
{
  "sha": "a1b2c3d4e5f6...",
  "content": "# Project kickoff\n\n...",
  "author": { "name": "...", "email": "..." },
  "date": "2026-07-19T14:23:00Z"
}
```

---

### GET `/api/documents/:id/revisions/diff`

Diff между двумя ревизиями. Query: `?from=<sha>&to=<sha>`.

**200:**
```json
{
  "from": { "sha": "...", "date": "..." },
  "to": { "sha": "...", "date": "..." },
  "diff": "diff --git ...\n- old\n+ new"
}
```

---

### POST `/api/documents/:id/revisions/:sha/restore`

Восстановить старую версию. editor/admin only.

Backend:
1. Redis lock
2. `git checkout <sha> -- <file_path>`
3. `git add` + `git commit -m "Restore <file> to <sha> [user:<login>]"`
4. POST yjs-server `/internal/reload?docid=...`
5. Release lock

**200:**
```json
{
  "newSha": "...",
  "restoredTo": { "sha": "...", "date": "..." }
}
```

---

## 7. Shares

### POST `/api/documents/:id/shares`

```json
{ "permission": "READ", "ttlHours": 72 }
```

**201:**
```json
{
  "share": {
    "token": "aBcDeFgHiJkLmNoPqRsTuVwXy",
    "url": "https://app.example.com/share/aBcDeFgHiJkLmNoPqRsTuVwXy",
    "permission": "READ",
    "expiresAt": "2026-07-22T12:00:00Z"
  }
}
```

---

### GET `/api/documents/:id/shares` → список share-ссылок.

### DELETE `/api/shares/:token` → 204.

### GET `/api/shares/:token/document` (публичный, без auth)

```json
{
  "document": { "id": "uuid", "title": "...", "permission": "READ" },
  "share": { "expiresAt": "..." }
}
```

**404** — не найден или истёк.

---

## 8. Uploads

### POST `/api/uploads`

Multipart: `file` (binary) + `documentId`.

Constraints: MIME allowlist (`image/*`, `application/pdf`, `text/plain`), ≤ 25 MB, квота.

**201:**
```json
{
  "upload": {
    "id": "uuid",
    "url": "/api/uploads/uuid",
    "fileName": "screenshot.png",
    "sizeBytes": 12345
  }
}
```

---

### GET `/api/uploads/:id`

Auth: JWT (проверка прав) или `?share=<token>`. Отдаёт файл.

---

## 9. WebSocket протокол (y-redis)

### 9.1. Подключение

Аутентифицированный:
```
wss://app.example.com/socket?docid=doc-<document.uuid>&token=<jwt>
```

Гость:
```
wss://app.example.com/socket?docid=doc-<document.uuid>&share=<share-token>
```

### 9.2. Handshake

1. Парсит `token` / `share`.
2. Валидирует JWT или share + TTL.
3. **401** → close 4001.
4. Читает файл из working tree → init Y.Doc.
5. Принимает Yjs sync protocol.

### 9.3. Read-only гость

`share.permission=READ` → sync проходит, updates отклоняются.

### 9.4. Close codes

| Code | Reason |
|---|---|
| 4001 | UNAUTHORIZED |
| 4002 | DOCUMENT_NOT_FOUND |
| 4003 | SHARE_EXPIRED |
| 4004 | RATE_LIMITED |

---

## 10. Health-check

### GET `/api/health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "checks": {
    "db": "ok",
    "redis": "ok",
    "minio": "ok",
    "git": "ok"
  }
}
```

---

## 11. Внутренние endpoints (между сервисами)

### POST `/internal/flush` (yjs-server)

Query: `?docid=doc-<uuid>`. Вызывается backend'ом перед commit.

y-redis: записывает `ydoc.getText('markdown').toString()` в файл working tree. **200**.

---

### POST `/internal/reload` (yjs-server)

Query: `?docid=doc-<uuid>`. Вызывается backend'ом после discard/restore.

y-redis:
1. Перечитывает файл из working tree.
2. Вычисляет diff (old Yjs → new file) через `fast-diff`.
3. Применяет insert/delete к `ydoc.getText('markdown')`.
4. Все клиенты получают Yjs update.

**200**.

---

## 12. MCP Server (НОВОЕ)

MCP (Model Context Protocol) сервер позволяет AI-агентам (Codex, Claude, другими LLM) программно взаимодействовать с md-collab: читать, искать, создавать и обновлять документы.

### 12.1. Транспорт

**HTTP+SSE transport** на отдельном порту (`mcp-server:3100`), проксируется через Nginx на `/mcp`.

Auth: `Authorization: Bearer <api-key>`. API key берётся из `User.apiKey`.

### 12.2. Tools

| Tool | Описание | Эквивалент в REST |
|---|---|---|
| `list_documents` | Список документов (с фильтром по папке) | `GET /api/tree` или `/api/documents` |
| `get_document` | Получить содержимое документа (из working tree) | `GET /api/documents/:id/export` |
| `search_documents` | Полнотекстовый поиск по контенту (через `git grep`) | новый |
| `create_document` | Создать новый документ | `POST /api/folders/:id/documents` |
| `update_document` | Полностью заменить содержимое документа (перезаписать working tree) | новый |
| `commit_document` | Зафиксировать версию | `POST /api/documents/:id/commit` |
| `list_revisions` | История версий | `GET /api/documents/:id/revisions` |
| `get_diff` | Diff между версиями или незакоммиченные изменения | `GET /api/documents/:id/diff` |
| `restore_revision` | Восстановить версию | `POST /api/documents/:id/revisions/:sha/restore` |
| `list_folders` | Дерево папок | `GET /api/tree` |

### 12.3. Resources

| Resource URI | Описание |
|---|---|
| `md-collab://documents/{id}` | Содержимое документа |
| `md-collab://documents/{id}/revisions` | История версий |
| `md-collab://folders/{id}/tree` | Дерево папок |

### 12.4. Пример взаимодействия

AI-агент (например, Codex) хочет узнать, что есть в базе знаний:

```
→ tools/call: list_documents { folderId: null }
← { documents: [{ id, title, filePath, updatedAt }] }

→ tools/call: get_document { id: "uuid" }
← { content: "# NDA Template\n\n...", title: "NDA template" }
```

Агент хочет создать новый документ из кода:

```
→ tools/call: create_document { folderId: "uuid", title: "API Reference", content: "# API Reference\n\n..." }
← { document: { id: "uuid", filePath: "Docs/api-reference.md" } }

→ tools/call: commit_document { id: "uuid", message: "Initial API reference" }
← { sha: "a1b2c3d", date: "..." }
```

### 12.5. Права доступа

MCP server использует `User.apiKey` для определения пользователя и его прав. Все операции проходят через ту же проверку прав, что и REST API:
- `viewer` → только чтение (list, get, search)
- `editor` → чтение + создание/правка/commit
- `admin` → всё

### 12.6. `search_documents` через `git grep`

```
git grep -n -i "<query>" -- '*.md'
```

Возвращает список `{ filePath, line, match }`.

### 12.7. `update_document` — важное отличие от web-flow

Web-редактирование идёт через Yjs (real-time, посимвольный merge). MCP-агенты работают асинхронно, без real-time, поэтому `update_document`:

1. Проверяет, что нет активной Yjs-сессии на этот документ (иначе 409 Conflict).
2. Перезаписывает файл в working tree.
3. Если `commit: true` — делает git commit.
4. Если активная Yjs-сессия — агент должен использовать `get_document → правки → commit` (без intermediate update_document).

---

## 13. Что НЕ вошло в MVP API

- Полнотекстовый поиск через REST (только через MCP `search_documents`).
- Теги, webhooks.
- PDF/HTML экспорт.
- Admin-статистика.

---

## 14. Открытые вопросы

- **MCP `update_document` vs активная Yjs-сессия** — блокировать или мержить? Текущее решение: блокировать (409), т.к. CRDT-merge программного full-replace нетривиален.
- **Rate limit на revisions** — `git log` может быть медленным на больших репо. Кэш в Redis?
- **MCP server как отдельный сервис или встроенный в backend?** Предлагаю отдельный (легче изолировать, обновлять протокол).

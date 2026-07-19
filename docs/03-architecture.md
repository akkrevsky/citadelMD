# 03 — Архитектура системы

> Стек зафиксирован в `02-tech-stack-options.md`.
> **v3 от 2026-07-19:** Web-only (без Obsidian/SSH), ручной commit + discard + restore.
> Целевая аудитория документа — кодовые агенты. Все решения описаны императивно.

---

## 1. Компонентная диаграмма

```
                          ┌───────────────────────────────────────────┐
                          │              Браузер (SPA)                 │
                          │  React + Vite + CodeMirror 6 + Yjs         │
                          │  + markdown-it preview                     │
                          └───────────────────────────────────────────┘
                              │                          │
              HTTPS (REST)   │                          │  WSS (real-time)
                  Cookies    │                          │  (JWT или share-token)
                              ▼                          ▼
┌─────────────────────────────────────────┐    ┌──────────────────────────────────┐
│           Nginx (reverse proxy)         │    │  Маршрутизация:                   │
│  - TLS termination                      │    │   /api/*     → backend:3000       │
│  - /        → SPA static                │    │   /socket   → yjs-server:1234     │
│  - /api/*   → backend                   │    │   /          → static files       │
│  - /socket  → yjs-server (WS)           │    │                                  │
└──────────────┬──────────────────────────┘    └──────────────────────────────────┘
               │                                            │
               ▼                                            ▼
┌──────────────────────────────────┐    ┌──────────────────────────────────────┐
│   Git repo (host volume)         │    │  Yjs WebSocket Server (y-redis)      │
│   /var/lib/md-collab/docs/       │    │  - CRDT sync (awareness + state)     │
│   ├── NDA.md  (working tree)     │◄───│  - Ephemeral: init from file on open │
│   └── .git/   (history)          │    │  - Auto-save to working tree (5s)    │
│       Source of truth = HEAD     │    │  - НЕ коммитит (только flush в файл) │
└──────────────────────────────────┘    └──────────────────────────────────────┘
               ▲                                            ▲
               │ git ops (commit/discard/restore/diff)      │
               │                                            │
┌──────────────┴───────────────────────────┐                │
│   Backend (Fastify)                      │                │
│   - REST API: /api/*                     │                │
│   - Auth (JWT cookie)                    │                │
│   - CRUD метаданных                      │                │
│   - Загрузка файлов → MinIO              │────────────────┘
│   - Git operations (simple-git):         │  HTTP /internal/notify-yjs
│     * commit (по кнопке)                 │  после commit/discard/restore
│     * discard (по кнопке)                │
│     * restore (по кнопке)                │
│     * diff/log (чтение истории)          │
│   - Periodic background commit (1 час)   │
└──────────────────────────────────────────┘
       │      │       │
       ▼      ▼       ▼
   ┌──────┐ ┌─────┐ ┌──────────┐
   │Redis │ │ PG  │ │  MinIO   │
   │      │ │     │ │  (S3)    │
   │session│ │meta │ │          │
   │cache │ │only │ │  200 ГБ  │
   │locks │ │     │ │          │
   │pub-sub│ │     │ │          │
   └──────┘ └─────┘ └──────────┘
```

**Список сервисов (Docker Compose):**

| Сервис | Образ / реализация | Порт | Назначение |
|---|---|---|---|
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy, TLS, static |
| `backend` | Node 20 + Fastify | 3000 | REST API, auth, uploads, **git ops (commit/discard/restore/diff)** |
| `yjs-server` | y-redis (Node) | 1234 | WebSocket CRDT gateway (ephemeral, auto-save only) |
| `postgres` | postgres:16 | 5432 | Метаданные (users, folders, shares, permissions) |
| `redis` | redis:7 | 6379 | Session, cache, pub-sub, distributed locks |
| `minio` | minio/minio | 9000, 9001 | S3-совместимое хранилище attachments |

Git-репозиторий — это volume на хосте, не отдельный контейнер.

**Всего: 6 сервисов** (в рамках заявленных 4–6).

---

## 2. Модель хранения контента

### 2.1. Три слоя хранения

| Слой | Где | Что хранит | Когда обновляется | Персистентность |
|---|---|---|---|---|
| **Yjs (RAM)** | y-redis контейнер | Текущее состояние документа | Непрерывно при правках | Ephemeral (при рестарте — init из файла) |
| **Working tree** | Файл на FS | Auto-saved контент | Каждые 5 сек из Yjs | Персистентный (выживает рестарт) |
| **Git HEAD** | `.git/` directory | Зафиксированные версии | Только по кнопке Commit | Перманентный (история) |

**Source of truth = Git HEAD.** Working tree = «черновик» с незакоммиченными правками. Yjs = оперативный слой для real-time.

### 2.2. Структура Git-репозитория

```
/var/lib/md-collab/docs/        ← root, git working repo
├── .git/                       ← history (commit'ы)
├── Legal/
│   ├── Contracts/
│   │   ├── NDA.md              ← documents.file_path = "Legal/Contracts/NDA.md"
│   │   └── MSA.md
│   └── Policies/
│       └── Privacy.md
├── Marketing/
│   └── kickoff.md
└── README.md                   ← системный, не показывается в UI
```

**Правила:**
- Каждый документ = один `.md` файл
- Путь к файлу = `documents.file_path` в БД (UNIQUE)
- Папки в репозитории = `folders` таблица
- Имена файлов: kebab-case, расширение `.md`
- Репозиторий — **внутреннее хранилище**, прямого доступа снаружи нет (без SSH, без file watcher)

### 2.3. Инициализация репозитория при первом старте

Backend при запуске:
1. Проверяет `GIT_REPO_PATH/.git/` существует.
2. Если нет — `git init`, initial commit с `README.md`.
3. Добавляет `GIT_REPO_PATH` в `safe.directory`.

Ручной `setup.sh` на хосте — **не нужен**. Всё делает backend автоматически.

### 2.4. Postgres = метаданные только

Что хранится в БД:
- `users`, `folder_permissions`, `shares`, `uploads`, `user_quotas`
- `folders` (id, parent_id, name, git_path) — **без содержимого**
- `documents` (id, folder_id, title, **file_path**, created_by, timestamps) — **без content_md**

Чего нет в БД:
- ❌ `content_md` — контент только в Git
- ❌ Yjs persistence table — Yjs ephemeral

---

## 3. Жизненный цикл Yjs-документа

### 3.1. Схема

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. CREATE DOCUMENT                                                   │
│  POST /api/folders/:id/documents                                      │
│  → backend:                                                           │
│    a) INSERT documents (id, file_path, title)                         │
│    b) Write file: "Legal/Contracts/NDA.md" = "# NDA\n\n"              │
│    c) git add + git commit -m "Create NDA.md [user:ivan]"             │
│       (создание документа = автоматически первый commit)              │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. OPEN DOCUMENT (WS connection)                                     │
│  Браузер → WSS /socket?docid=...&token=...                            │
│  y-redis:                                                             │
│    a) Read file from Git working tree: "Legal/Contracts/NDA.md"       │
│    b) Initialize Y.Doc: ydoc.getText('markdown') = <file content>    │
│    c) Запомнить doc-id → file_path mapping (in-memory)                │
│  → клиент получает initial state → CodeMirror отображает текст        │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. COLLABORATIVE EDITING                                             │
│  - Все правки идут через y-redis (CRDT merge)                         │
│  - y-redis: AUTO-SAVE в working tree (5 сек после последней правки):  │
│    a) ydoc.getText('markdown').toString() → full markdown text        │
│    b) overwrite file in working tree                                  │
│    c) НЕТ git commit (только запись в файл)                           │
│  - Git HEAD остаётся на последнем коммите                             │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  4. COMMIT (по кнопке)                                                │
│  POST /api/documents/:id/commit { message }                           │
│  → backend:                                                           │
│    a) Приобрести Redis distributed lock на file_path                  │
│    b) Дёрнуть y-redis: POST /internal/flush?docid=...                 │
│       (flush current Yjs state to working tree перед коммитом)        │
│    c) git add <file_path>                                             │
│    d) git commit -m "<message> [user:ivan]"                           │
│       (с GIT_AUTHOR_* из user record)                                 │
│    e) Освободить lock                                                 │
│    f) Уведомить y-redis: POST /internal/notify-yjs?docid=...          │
│       (y-redis помечает, что HEAD сдвинулся)                          │
│  → в истории появляется новая версия                                  │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  5. DISCARD (по кнопке «отменить изменения»)                          │
│  POST /api/documents/:id/discard                                      │
│  → backend:                                                           │
│    a) Приобрести Redis distributed lock на file_path                  │
│    b) git checkout HEAD -- <file_path>                                │
│       (working tree = последняя сохранённая версия, правки стёрты)    │
│    c) Освободить lock                                                 │
│    d) POST http://yjs-server:1234/internal/reload?docid=...           │
│       → y-redis перечитывает файл → переинициализирует Y.Doc          │
│       → все подключённые клиенты получают откат (через Yjs update)    │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  6. CLOSE DOCUMENT (last user disconnects)                            │
│  - y-redis: финальный flush в working tree (auto-save)                │
│  - Destroy Y.Doc (free memory)                                        │
│  - Next open = re-init from file                                      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2. Ключевое правило для агентов

**Только y-redis пишет в working tree (auto-save).** Backend читает working tree для diff/commit, но НЕ пишет напрямую — только через `git checkout` (discard/restore) или `git add+commit` (commit). Чтобы избежать race condition между y-redis auto-save и git checkout, используется Redis distributed lock.

### 3.3. Что при падении y-redis

- Yjs-сессии теряются (клиенты переподключаются)
- При реконнекте: y-redis читает working tree → инициализирует Y.Doc → клиент получает текущее состояние файла
- **Незакоммиченные auto-saved правки сохраняются** (они в файле на FS)
- Если упал и FS — теряются правки с момента последнего auto-save (≤ 5 сек). Коммиты в Git HEAD не теряются.

### 3.4. Periodic background commit (страховка)

Чтобы при падении FS не терять значимые правки, backend раз в час:
1. Находит все документы с активными Yjs-сессиями.
2. Для каждого: flush + `git diff HEAD -- <file>` — если есть изменения, делает auto-commit с сообщением `[periodic-autosave] <file_path>`.
3. Это страховка, **не основной механизм версионности**.

---

## 4. Git operations в backend

### 4.1. Библиотека

Используется `simple-git` (npm). Обёртка `apps/backend/src/services/git.service.ts`:

```typescript
import simpleGit, { SimpleGit } from 'simple-git'

export class GitService {
  private git: SimpleGit

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async commit(filePath: string, message: string, author: { name: string; email: string }) {
    await this.git.add(filePath)
    await this.git.commit(message, filePath, {
      '--author': `${author.name} <${author.email}>`,
    })
  }

  async discard(filePath: string) {
    await this.git.checkout(['HEAD', '--', filePath])
  }

  async restore(filePath: string, sha: string) {
    await this.git.checkout([sha, '--', filePath])
  }

  async log(filePath: string, options?: { from?: string; to?: string; maxCount?: number }) {
    return this.git.log({ file: filePath, ...(options && { from: options.from, to: options.to, maxCount: options.maxCount }) })
  }

  async diffUncommitted(filePath: string): Promise<string> {
    return this.git.diff(['HEAD', '--', filePath])
  }

  async diff(filePath: string, fromSha: string, toSha: string): Promise<string> {
    return this.git.diff([fromSha, toSha, '--', filePath])
  }

  async show(sha: string, filePath: string): Promise<string> {
    return this.git.show([`${sha}:${filePath}`])
  }
}
```

### 4.2. Распределённая блокировка

Перед любой write-операцией с Git (commit, discard, restore):

```typescript
async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `git-lock:${filePath}`
  const acquired = await redis.set(lockKey, '1', 'NX', 'PX', 10000) // 10s TTL
  if (!acquired) throw new Error('FILE_LOCKED')
  try {
    return await fn()
  } finally {
    await redis.del(lockKey)
  }
}
```

### 4.3. Flush перед commit

Перед `git add+commit` backend просит y-redis записать текущее Yjs-состояние в файл, чтобы в коммит попали самые свежие правки:

```
POST http://yjs-server:1234/internal/flush?docid=doc-<uuid>
```

y-redis:
1. Берёт `ydoc.getText('markdown').toString()`
2. Перезаписывает файл
3. Возвращает 200

Если Yjs-сессия не активна (документ закрыт) — flush не нужен, working tree уже актуален.

### 4.4. Reload после discard/restore

После `git checkout HEAD` (discard) или `git checkout <sha>` (restore) backend просит y-redis перечитать файл и обновить Yjs-сессию:

```
POST http://yjs-server:1234/internal/reload?docid=doc-<uuid>
```

y-redis:
1. Читает файл из working tree
2. Вычисляет diff: old Yjs content → new file content (через `fast-diff`)
3. Применяет insert/delete к `ydoc.getText('markdown')`
4. Все подключённые клиенты автоматически получают обновление (через Yjs sync protocol)

**Это единственный случай, когда Yjs-сессия модифицируется не пользователем** — и он полностью контролируем backend'ом.

### 4.5. Author mapping

Каждый commit несёт автора из `users`:

```
GIT_AUTHOR_NAME=<user.gitName || user.login>
GIT_AUTHOR_EMAIL=<user.gitEmail || "noreply@mdcollab.local">
GIT_COMMITTER_NAME=<same>
GIT_COMMITTER_EMAIL=<same>
```

---

## 5. Аутентификация и авторизация

### 5.1. Роли

| Роль | Права |
|---|---|
| `admin` | Всё + управление пользователями + управление папками/пространствами |
| `editor` | Создание/редактирование документов в доступных папках + commit/discard/restore |
| `viewer` | Только чтение в доступных папках (видит историю, но не может commit/edit) |

### 5.2. Login flow (JWT в httpOnly cookie)

```
POST /api/auth/login { login, password }
  → bcrypt.compare(password, hash)
  → sign JWT { sub, role, exp: 7d }
  → Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

### 5.3. WebSocket auth (y-redis)

| Источник | Механизм |
|---|---|
| Аутентифицированный юзер | Cookie `token` → JWT verify |
| Гость по share-ссылке | Query-param `?share=<token>`, TTL check |

### 5.4. Проверка прав на действие

| Действие | Роли |
|---|---|
| Открыть документ, читать | admin, editor, viewer (с правами на папку) |
| Редактировать в real-time | admin, editor (НЕ viewer) |
| Commit (создать версию) | admin, editor |
| Discard (отменить правки) | admin, editor |
| Restore старой версии | admin, editor |
| Просмотр истории / diff | admin, editor, viewer |

---

## 6. Share-ссылки

### 6.1. Модель

```
shares (
  token        VARCHAR(32) PK,
  document_id  UUID REFERENCES documents,
  permission   ENUM('read', 'write'),
  metadata     JSONB,
  expires_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT now()
)
```

### 6.2. Гость в real-time

- Гость получает **полную Yjs-сессию** (видит курсоры, правки)
- При `permission=read`: y-redis отклоняет update-сообщения от гостя
- При `permission=write`: гость полноценно редактирует, но **не может commit/discard/restore** (это только для аутентифицированных editor/admin)
- Auto-save от гостя идёт в working tree как обычно
- Гости **не** видят дерево папок и историю коммитов — только один документ

---

## 7. Поток загрузки файлов (attachments)

```
1. Drag-n-drop / paste в редакторе
2. Frontend: POST /api/uploads
     - multipart/form-data
     - body: file + documentId
3. Backend:
     - проверка прав на document_id
     - MIME allowlist (image/*, application/pdf, text/plain)
     - size limit: 25 MB
     - PUT в MinIO (S3)
     - INSERT в uploads
     - return { url: '/api/uploads/{id}' }
4. Frontend: вставляет markdown `![](api/uploads/{id})` в позиции курсора
5. При рендере preview backend раздаёт /api/uploads/{id}:
     - для аутентифицированных — проверка прав
     - для гостей — проверка share-token
```

### 7.1. Квоты

- На пользователя: 5 ГБ (default)
- На пространство (папка верхнего уровня): 50 ГБ
- Лимит файла: 25 MB
- MinIO bucket: `md-collab-uploads`, retention: none

---

## 8. Иерархия папок/пространств

### 8.1. Модель

```
folders (
  id          UUID PK,
  parent_id   UUID REFERENCES folders(id) NULL,
  name        VARCHAR(200),
  git_path    VARCHAR(1000),
  created_at  TIMESTAMP,
  created_by  UUID REFERENCES users
)

documents (
  id          UUID PK,
  folder_id   UUID REFERENCES folders(id),
  title       VARCHAR(300),
  file_path   VARCHAR(1000) UNIQUE,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP,
  created_by  UUID REFERENCES users
)

folder_permissions (
  folder_id   UUID REFERENCES folders,
  user_id     UUID REFERENCES users,
  permission  ENUM('view', 'edit', 'admin'),
  PK (folder_id, user_id)
)
```

### 8.2. Права доступа (наследование)

- Права задаются на узле дерева (`folder_permissions`).
- **Наследование вниз:** `edit` на `/legal/` → `edit` на всех вложенных.
- **Permission escalation:** явная выдача `admin` на вложенной перекрывает унаследованное.
- Алгоритм: обойти путь от корня к узлу, взять максимум прав по пути.

---

## 9. Markdown preview и расширения

### 9.1. Пайплайн рендера (frontend)

```
Y.Text('markdown')
       │
       ▼  (debounce 300ms)
  markdown-it.parse()
       │
       ▼  (плагины: mermaid, katex, panel, embeds)
  markdown-it.render()
       │
       ▼  (sanitize)
  DOMPurify.sanitize()
       │
       ▼
  React-рендер preview-панели
```

### 9.2. Auto-save в working tree (y-redis)

Каждое изменение в Yjs сбрасывает debounce-таймер на 5 секунд. По таймауту:

```typescript
async function autoSaveToWorkingTree(docId: string, filePath: string) {
  const content = ydoc.getText('markdown').toString()
  await fs.writeFile(repoPath + '/' + filePath, content, 'utf-8')
  // НЕТ git commit — только запись в файл
}
```

### 9.3. Набор плагинов markdown-it

| Расширение | Пакет |
|---|---|
| Подсветка кода | `markdown-it-prism` |
| Mermaid diagrams | `markdown-it-mermaid` |
| KaTeX math | `markdown-it-katex` |
| Footnotes | `markdown-it-footnote` |
| Task lists | `markdown-it-task-lists` |
| Callouts | `markdown-it-container` + кастом |
| Tables (GFM) | built-in + GFM |
| Embeds | custom render-rule (YouTube/Vimeo → `<iframe>`) |

### 9.4. Sanitize

- **HTML отключён** в markdown-it (`html: false`)
- DOMPurify прогоняется после рендера
- Embeds — allowlist доменов: `youtube.com`, `vimeo.com`

### 9.5. CodeMirror 6 — конфигурация

```js
const editor = new EditorView({
  extensions: [
    lineNumbers(),
    history(),
    highlightSpecialChars(),
    markdownLanguage,             // @codemirror/lang-markdown
    syntaxHighlighting(defaultHighlightStyle),
    yCollab(ydoc.getText('markdown'), ydoc.awareness),  // y-codemirror.next
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.theme({}),
  ],
  parent: containerEl,
})
```

---

## 10. Разделение backend / yjs-server

Почему y-redis — отдельный сервис:

1. **Масштабируемость** — можно запускать несколько реплик.
2. **Изоляция сбоев** — падение CRDT-движка не роняет REST API.
3. **Чистота кода** — y-redis готовый пакет.

**Связь backend ↔ yjs-server:**
- **HTTP** для прямых вызовов:
  - `POST /internal/flush?docid=...` — flush Yjs state в файл перед commit
  - `POST /internal/reload?docid=...` — перечитать файл после discard/restore
- **Redis pub/sub** для уведомлений (опционально)
- **Общий Git volume** — оба сервиса работают с одной FS

---

## 11. Версионность (Git-based) — полная спецификация

### 11.1. Commit (ручной)

```
POST /api/documents/:id/commit
  body: { message: "Добавить секцию про конфиденциальность" }
  → withFileLock:
      1. POST yjs-server /internal/flush?docid=...
      2. git add <file_path>
      3. git commit -m "<message> [user:<login>]"
  → response: { sha, message, date, author }
```

### 11.2. Discard (ручной)

```
POST /api/documents/:id/discard
  → withFileLock:
      1. git checkout HEAD -- <file_path>
      2. POST yjs-server /internal/reload?docid=...
  → response: { ok: true }
```

### 11.3. Restore (ручной)

```
POST /api/documents/:id/revisions/:sha/restore
  → withFileLock:
      1. git checkout <sha> -- <file_path>
      2. git add <file_path>
      3. git commit -m "Restore <file_path> to <sha> [user:<login>]"
      4. POST yjs-server /internal/reload?docid=...
  → response: { newSha, restoredTo: { sha, date } }
```

### 11.4. Просмотр незакоммиченных изменений

```
GET /api/documents/:id/diff
  → git diff HEAD -- <file_path>
  → response: { diff: "<unified diff>", hasUncommittedChanges: true|false }
```

### 11.5. История коммитов

```
GET /api/documents/:id/revisions?limit=100&offset=0
  → git log --format=... -- <file_path>
  → response: { revisions: [{ sha, author, date, message }], hasMore }
```

### 11.6. Diff между версиями

```
GET /api/documents/:id/revisions/diff?from=<sha>&to=<sha>
  → git diff <from> <to> -- <file_path>
  → response: { from, to, diff }
```

---

## 12. Обработка ошибок и edge-cases

| Сценарий | Поведение |
|---|---|
| WS-разрыв во время редактирования | Клиент ретраит. Yjs локально хранит pending updates, отправит при реконнекте. |
| Документ удалён во время открытой сессии | y-redis закрывает WS, SPA показывает «документ удалён», backend делает `git rm <file> + commit`. |
| Гость с read-ссылкой пытается отправить update | y-redis отклоняет, warning в консоль. |
| Share-токен истёк во время сессии | y-redis закрывает WS, SPA показывает «срок действия истёк». |
| Превышена квота uploads | Backend возвращает 413, SPA toast. |
| **Двое одновременно нажимают Commit** | Redis distributed lock — первый выигрывает, второй получает 409 Conflict. |
| **Commit без изменений (working tree = HEAD)** | Backend возвращает 200, но не создаёт пустой коммит. Сообщение: «нет изменений для коммита». |
| **Discard без изменений** | Backend возвращает 200, no-op. |
| **Restore к версии, которая была удалена (sha не найден)** | 404. |
| **y-redis недоступен при commit** | Backend пробует flush, при таймауте (3 сек) — коммитит текущий working tree (там могут быть правки ≤ 5 сек назад). |
| **y-redis недоступен при discard/restore** | Backend отклоняет операцию (503), т.к. Yjs-сессия не обновится. |
| **Postgres упал** | Web-редактирование невозможно (auth broken). Git-репозиторий остаётся в последнем состоянии. |
| **FS переполнена** | Auto-save падает, y-redis логирует ошибку, клиенты видят warning «не удалось сохранить». |

---

## 13. Безопасность

- **HTTPS only** (Nginx → TLS, Let's Encrypt).
- **httpOnly + Secure + SameSite=Lax cookies.**
- **CORS:** только same-origin.
- **Rate limiting:** на `/api/auth/login` (5 попыток/мин/IP).
- **Sanitize markdown** (DOMPurify, html:false).
- **Allowlist MIME для uploads.**
- **JWT secret** в env-переменной, длина ≥ 256 бит.
- **Share tokens:** `crypto.randomBytes(24).toString('base64url')` (192 bits entropy).
- **MinIO:** bucket policy private, доступ только через backend.
- **Git repo:** доступ только через backend/yjs-server (внутри Docker), **нет SSH-доступа снаружи**.

---

## 14. Не вошедшее в MVP

- ❌ Полнотекстовый поиск.
- ❌ Теги / метаданные документов.
- ❌ Wiki-links `[[...]]` и backlinks.
- ❌ Экспорт в PDF/HTML.
- ❌ Webhooks / notifications.
- ❌ OAuth / SSO.
- ❌ Obsidian / локальное редактирование файлов.
- ❌ 2FA.

---

## 15. Глоссарий (для агентов)

| Термин | Значение |
|---|---|
| **Source of truth** | Git HEAD файла в working tree репозитория `/var/lib/md-collab/docs/` |
| **Working tree** | Текущее состояние файлов на диске (включая незакоммиченные auto-saved правки) |
| **Yjs-сессия** | Ephemeral CRDT-документ, инициализируется из working tree при открытии |
| **Auto-save** | Запись Yjs-состояния в working tree каждые 5 сек, БЕЗ git commit |
| **Commit** | Ручная операция: `git add + git commit` — создаёт новую версию |
| **Discard** | Ручная операция: `git checkout HEAD -- <file>` — откатывает незакоммиченные правки |
| **Restore** | Ручная операция: восстановление старой версии через `git checkout <sha>` + новый commit |
| **Revision / SHA** | Git commit hash (например `a1b2c3d`) |
| **Flush** | Внутренний вызов от backend к y-redis: записать текущее Yjs-состояние в файл |
| **Reload** | Внутренний вызов от backend к y-redis: перечитать файл и обновить Yjs-сессию |

---

## 16. Открытые вопросы

1. **UI индикация незакоммиченных изменений** — как показать пользователю, что у него есть unsaved-as-commit правки? Вариант: бейдж в header документа + кнопка Commit активна.
2. **Длина debounce для auto-save** — 5 сек достаточно, или сделать 3 сек? Зависит от UX-тестирования.
3. **Поведение Commit при пустом сообщении** — генерировать дефолтное `Update <title>` или требовать обязательное?
4. **Periodic background commit** — раз в час или реже? Нужен ли вообще, если auto-save надёжно пишет в файл?
5. **Cleanup старых SHA** — Git хранит всю историю. `git gc --auto` встроен, но можно настроить агрессивнее.
6. **Commit от гостя с write-ссылкой** — разрешить или только для аутентифицированных editor/admin? Текущее решение: только аутентифицированные.

---

## 17. Что идёт в следующие документы

- [`04-database-schema.md`](./04-database-schema.md) — полная схема Postgres + Prisma models (без `content_md`, без `sshPublicKey`).
- [`05-api-contracts.md`](./05-api-contracts.md) — REST endpoints + WS протокол + **commit/discard/restore/diff endpoints**.
- [`06-infra-deploy.md`](./06-infra-deploy.md) — Docker Compose, Nginx, Git auto-init, backup scripts (без SSH/Obsidian).
- [`07-agent-roadmap.md`](./07-agent-roadmap.md) — фазы разработки (упрощённая Phase 3, commit/discard в Phase 2).

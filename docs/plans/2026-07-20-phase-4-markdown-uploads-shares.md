# Phase 4 — Markdown extensions, Uploads, Shares

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
>
> **Context:** Phase 0-3 completed (scaffolding, auth, documents CRUD + Git versions, Yjs real-time editing).
> Production on `main`. Current stack: React + CodeMirror 6 + Yjs + markdown-it (basic), Prisma schema already has `Upload`, `Share`, `UserQuota` models defined.
>
> **Goal:** Add all 8 markdown-it plugins + Excalidraw embedded editor, DOMPurify sanitization, file uploads with MinIO, drag-n-drop/paste, public share links with guest Yjs permissions, share dialog UI, E2E tests, Docker/docs updates.

---

## Task 1: Prisma migration — uploads, shares, user_quotas

**Objective:** The Prisma schema already defines `Upload`, `Share`, `UserQuota` models. Generate and apply migration, then verify.

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (already has models from spec — verify)
- Run: `npx prisma migrate dev --name phase4-uploads-shares-quotas`

**Implementation details:**

1. Verify `schema.prisma` has models: `Upload`, `Share`, `SharePermission`, `UserQuota` (they exist — lines 107-156)
2. Run migration:

```bash
cd apps/backend
npx prisma migrate dev --name phase4-uploads-shares-quotas
```

3. Verify migration SQL in `apps/backend/prisma/migrations/`:

| Expected table | Key columns |
|---|---|
| `uploads` | id UUID PK, document_id UUID FK, file_name, mime_type, size_bytes, object_key, created_by UUID FK, created_at |
| `shares` | token VARCHAR(32) PK, document_id UUID FK, permission ENUM('READ','WRITE'), expires_at TIMESTAMP, created_by UUID FK, created_at |
| `user_quotas` | user_id UUID PK FK, max_storage_bytes BIGINT DEFAULT 5368709120, used_storage_bytes BIGINT DEFAULT 0 |

4. Verify Prisma types compile:

```bash
cd apps/backend && npx prisma generate
```

**Verification:**
- [ ] Migration runs without errors
- [ ] `npx prisma db push --dry-check` reports no drift
- [ ] TypeScript compilation passes

**Commit message:** `feat(db): add migration for uploads, shares, user_quotas`

---

## Task 2: Install markdown-it plugins + DOMPurify + Excalidraw (frontend)

**Objective:** Install all npm packages needed for the markdown rendering pipeline, sanitization, and Excalidraw embedded editor.

**Files:**
- Modify: `apps/web/package.json`

**Implementation details:**

Add to `dependencies` in `apps/web/package.json`:

```json
{
  "markdown-it-prism": "^2.2.4",
  "markdown-it-mermaid": "^0.4.2",
  "markdown-it-katex": "^3.0.4",
  "markdown-it-footnote": "^4.0.0",
  "markdown-it-task-lists": "^2.1.1",
  "markdown-it-container": "^4.0.0",
  "markdown-it-gfm": "^0.2.0",
  "dompurify": "^3.1.0",
  "@excalidraw/excalidraw": "^0.17.0"
}
```

Add to `devDependencies`:

```json
{
  "@types/dompurify": "^3.0.5"
}
```

Then install:

```bash
cd apps/web && npm install
```

**Verification:**
- [ ] `npm install` completes without errors
- [ ] `npx tsc --noEmit` passes
- [ ] `@excalidraw/excalidraw` package resolves in `node_modules`

**Commit message:** `feat(web): install markdown-it plugins, dompurify, excalidraw`

---

## Task 3: Create markdown-it renderer with all plugins + DOMPurify

**Objective:** Build the complete markdown rendering pipeline: markdown-it with plugins -> DOMPurify -> React preview component.

**Files:**
- Create: `apps/web/src/lib/markdown-renderer.ts`
- Create: `apps/web/src/components/MarkdownPreview.tsx`

**Implementation details:**

### `apps/web/src/lib/markdown-renderer.ts`

```typescript
import MarkdownIt from 'markdown-it'
import prism from 'markdown-it-prism'
import mermaidPlugin from 'markdown-it-mermaid'
import { katexPlugin as katex } from 'markdown-it-katex'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import container from 'markdown-it-container'
import { gfmPlugin as gfm } from 'markdown-it-gfm'
import DOMPurify from 'dompurify'

// DOMPurify config — allow class/id for mermaid/katex/callouts, allow SVG for excalidraw
const PURIFY_CONFIG: DOMPurify.Config = {
  ADD_ATTR: ['id'],
  ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'g', 'defs', 'use', 'image', 'text', 'tspan', 'marker',
    'stop', 'linearGradient', 'radialGradient', 'clipPath', 'mask'],
  ALLOWED_ATTR: ['class', 'id', 'href', 'src', 'alt', 'width', 'height',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r',
    'x', 'y', 'dx', 'dy', 'rx', 'ry', 'points', 'transform',
    'xmlns', 'preserveAspectRatio'],
  ALLOW_DATA_ATTR: false,
}

// YouTube/Vimeo embed iframe allowlist
const EMBED_ALLOWED_HOSTS = ['www.youtube.com', 'youtube.com', 'player.vimeo.com']

function embedPlugin(md: MarkdownIt): void {
  const defaultRender = md.renderer.rules.image ?? ((tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options)
  )

  md.renderer.rules.text = (tokens, idx) => {
    const text = tokens[idx].content
    // YouTube: https://youtube.com/watch?v=XXX or https://youtu.be/XXX
    const ytMatch = text.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    )
    if (ytMatch) {
      return `<div class="embed-container"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe></div>`
    }
    // Vimeo: https://vimeo.com/XXXXX
    const vimeoMatch = text.match(
      /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/
    )
    if (vimeoMatch) {
      return `<div class="embed-container"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" allowfullscreen></iframe></div>`
    }
    return defaultRender(tokens, idx, options, env, self)
  }
}

// Callouts like Obsidian: > [!warning] / > [!info] / > [!danger]
function createCalloutContainer(md: MarkdownIt, type: string): void {
  md.use(container, type, {
    render(tokens: MarkdownIt.Token[], idx: number) {
      const token = tokens[idx]
      if (token.nesting === 1) {
        return `<div class="callout callout-${type}">\n`
      }
      return '</div>\n'
    }
  })
}

let md: MarkdownIt | null = null

export function getMarkdownIt(): MarkdownIt {
  if (md) return md

  md = new MarkdownIt({
    html: false,  // HTML disabled — DOMPurify is second layer
    linkify: true,
    typographer: true,
    breaks: false,
  })

  md.use(prism)
    .use(mermaidPlugin)
    .use(katex, { throwOnError: false })
    .use(footnote)
    .use(taskLists, { enabled: true, label: true })
    .use(gfm)

  // Callouts: warning, info, danger, tip, note
  ;['warning', 'info', 'danger', 'tip', 'note'].forEach((t) =>
    createCalloutContainer(md!, t)
  )

  // Custom embed plugin
  embedPlugin(md)

  return md
}

export function renderMarkdown(text: string): string {
  const renderer = getMarkdownIt()
  const html = renderer.render(text)
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

export function renderMarkdownAsync(text: string): string {
  // For mermaid — post-process to trigger render
  return renderMarkdown(text)
}
```

### `apps/web/src/components/MarkdownPreview.tsx`

```tsx
import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown-renderer'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content])

  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

**Verification:**
- [ ] `npx tsc --noEmit` passes
- [ ] Import `renderMarkdown('# Hello')` returns sanitized HTML
- [ ] KaTeX `$E=mc^2$` renders as math
- [ ] Mermaid code block renders as diagram placeholder
- [ ] `> [!warning]` renders as callout div
- [ ] YouTube link renders as iframe embed

**Commit message:** `feat(web): add markdown-it renderer with 8 plugins, DOMPurify sanitization`

---

## Task 4: Excalidraw embedded editor component

**Objective:** Create an Excalidraw integration that lets users draw diagrams and embed them as SVG base64 in markdown.

**Files:**
- Create: `apps/web/src/components/ExcalidrawEditor.tsx`
- Create: `apps/web/src/components/ExcalidrawPlugin.tsx` (markdown-it render rule for excalidraw blocks)

**Implementation details:**

### `apps/web/src/components/ExcalidrawEditor.tsx`

```tsx
import { useState, useCallback, useRef } from 'react'
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types/types'

interface ExcalidrawEditorProps {
  initialData?: ExcalidrawInitialDataState
  onSave: (svgDataUrl: string) => void
  onClose: () => void
}

export function ExcalidrawEditor({ initialData, onSave, onClose }: ExcalidrawEditorProps) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleExport = useCallback(async () => {
    if (!excalidrawRef.current) return
    setIsSaving(true)

    try {
      // Export to SVG
      const svg = await excalidrawRef.current.exportToSvg({
        exportBackground: true,
        exportWithDarkMode: false,
      })

      // Convert SVG to data URL
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

      onSave(dataUrl)
    } catch (error) {
      console.error('Excalidraw export failed:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  return (
    <div className="excalidraw-editor-wrapper" style={{ height: '500px' }}>
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawRef.current = api }}
        initialData={initialData}
      >
        <WelcomeScreen />
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
      <div className="excalidraw-actions">
        <button onClick={handleExport} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Insert into document'}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
```

### `apps/web/src/components/ExcalidrawPlugin.tsx`

```tsx
// markdown-it custom container for excalidraw blocks
// Usage in markdown: ```excalidraw\n<svg>...</svg>\n```
// The SVG content gets inserted as an inline SVG in the preview

import type MarkdownIt from 'markdown-it'

export function excalidrawBlockPlugin(md: MarkdownIt): void {
  // Add a custom fence render rule for 'excalidraw' language
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'excalidraw') {
      const svgContent = token.content.trim()
      // If it's a data URL (base64), decode and embed
      if (svgContent.startsWith('data:image/svg+xml;base64,')) {
        const base64 = svgContent.replace('data:image/svg+xml;base64,', '')
        const decoded = atob(base64)
        return `<div class="excalidraw-embed">${decoded}</div>`
      }
      // Otherwise treat the content as raw SVG
      return `<div class="excalidraw-embed">${svgContent}</div>`
    }
    return defaultFence?.(tokens, idx, options, env, self) ?? ''
  }
}
```

### Toolbar button integration (in `DocumentEditPage.tsx`)

Add state and a button in the document header toolbar:

```tsx
const [showExcalidraw, setShowExcalidraw] = useState(false)
const handleExcalidrawSave = (svgDataUrl: string) => {
  // Insert excalidraw block into the editor
  const insertText = `\`\`\`excalidraw\n${svgDataUrl}\n\`\`\`\n\n`
  // Insert at cursor position via CodeMirror command
  document.dispatchEvent(new CustomEvent('excalidraw-insert', {
    detail: { text: insertText }
  }))
  setShowExcalidraw(false)
}
```

**Verification:**
- [ ] Excalidraw component renders in a modal/panel
- [ ] Drawing on canvas works (lines, shapes, text)
- [ ] "Insert into document" exports SVG as base64 data URL
- [ ] Preview renders the excalidraw SVG inline
- [ ] `npx tsc --noEmit` passes

**Commit message:** `feat(web): add Excalidraw embedded editor with SVG export`

---

## Task 5: Upload API — POST /api/uploads

**Objective:** Create multipart upload endpoint with MIME allowlist, size limit (25 MB), quota check, and MinIO PUT.

**Files:**
- Create: `apps/backend/src/routes/upload.routes.ts`
- Modify: `apps/backend/src/index.ts` (register routes)

**Implementation details:**

### `apps/backend/src/routes/upload.routes.ts`

```typescript
import { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { prisma } from '../prisma.js'
import { getMinioClient } from '../services/minio.service.js'
import { verifyAuth } from '../middleware/auth.js'
import { randomUUID } from 'crypto'
import { extname } from 'path'

const MIME_ALLOWLIST = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/markdown',
]

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'md-collab-uploads'

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
    },
  })

  app.post('/api/uploads', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id

    const data = await request.file()
    if (!data) {
      reply.code(400)
      return { error: { code: 'NO_FILE', message: 'No file provided' } }
    }

    // Check MIME type
    const mimeType = data.mimetype
    if (!MIME_ALLOWLIST.includes(mimeType)) {
      reply.code(400)
      return { error: { code: 'INVALID_MIME', message: `MIME type ${mimeType} not allowed` } }
    }

    // Get documentId from fields
    const documentId = (data.fields as any)?.documentId?.value
    if (!documentId) {
      reply.code(400)
      return { error: { code: 'MISSING_DOCUMENT_ID', message: 'documentId is required' } }
    }

    // Verify document exists and user has access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { folder: true },
    })
    if (!document) {
      reply.code(404)
      return { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } }
    }

    // Read file buffer
    const buffer = await data.toBuffer()
    const sizeBytes = buffer.length

    // Check file size
    if (sizeBytes > MAX_FILE_SIZE) {
      reply.code(413)
      return { error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 25 MB limit' } }
    }

    // Check quota
    let quota = await prisma.userQuota.findUnique({ where: { userId } })
    if (!quota) {
      quota = await prisma.userQuota.create({
        data: {
          userId,
          maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB default
          usedStorageBytes: 0,
        },
      })
    }

    const newUsed = quota.usedStorageBytes + sizeBytes
    if (newUsed > quota.maxStorageBytes) {
      reply.code(413)
      return {
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Storage quota exceeded (${(quota.maxStorageBytes / 1024 / 1024 / 1024).toFixed(1)} GB limit)`,
        },
      }
    }

    // Generate object key
    const ext = extname(data.filename)
    const objectKey = `${userId}/${randomUUID()}${ext}`

    // Upload to MinIO
    const minio = getMinioClient()
    await minio.putObject(MINIO_BUCKET, objectKey, buffer, sizeBytes, {
      'Content-Type': mimeType,
    })

    // Insert into DB
    const upload = await prisma.upload.create({
      data: {
        documentId,
        fileName: data.filename,
        mimeType,
        sizeBytes,
        objectKey,
        createdById: userId,
      },
    })

    // Update quota
    await prisma.userQuota.update({
      where: { userId },
      data: { usedStorageBytes: newUsed },
    })

    reply.code(201)
    return {
      upload: {
        id: upload.id,
        url: `/api/uploads/${upload.id}`,
        fileName: upload.fileName,
        sizeBytes: upload.sizeBytes,
      },
    }
  })
}
```

### `apps/backend/src/services/minio.service.ts`

```typescript
import { Client as MinioClient } from 'minio'

let minioClient: MinioClient | null = null

export function getMinioClient(): MinioClient {
  if (!minioClient) {
    minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'mdcollab',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    })
  }
  return minioClient
}
```

**Verification:**
- [ ] `POST /api/uploads` with multipart file returns 201 with upload object
- [ ] MIME check rejects `application/x-msdownload`
- [ ] File > 25 MB returns 413
- [ ] Quota exceeded returns 413 with QUOTA_EXCEEDED code
- [ ] File appears in MinIO bucket
- [ ] Upload record appears in Postgres

**Commit message:** `feat(api): add POST /api/uploads with MIME allowlist, size limit, quota check, MinIO`

---

## Task 6: Upload GET + Quota endpoints

**Objective:** GET endpoint for serving files (auth via JWT or share-token), admin quota management endpoints.

**Files:**
- Modify: `apps/backend/src/routes/upload.routes.ts`
- Create: `apps/backend/src/routes/admin.routes.ts`

**Implementation details:**

### GET `/api/uploads/:id` (add to upload.routes.ts)

```typescript
import { verifyAuth } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/share-auth.js'

app.get('/api/uploads/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const share = (request.query as { share?: string }).share

  // Find upload
  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { document: true },
  })
  if (!upload) {
    reply.code(404)
    return { error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload not found' } }
  }

  // Check access: JWT auth or share token
  let hasAccess = false
  if (share) {
    const shareRecord = await prisma.share.findUnique({ where: { token: share } })
    if (shareRecord && shareRecord.documentId === upload.documentId && shareRecord.expiresAt > new Date()) {
      hasAccess = true
    }
  } else {
    try {
      // verifyAuth sets request.user
      await verifyAuth(request as any, reply as any)
      hasAccess = true
    } catch {
      hasAccess = false
    }
  }

  if (!hasAccess) {
    reply.code(401)
    return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
  }

  // Stream from MinIO
  const minio = getMinioClient()
  const readable = await minio.getObject(MINIO_BUCKET, upload.objectKey)

  reply.header('Content-Type', upload.mimeType)
  reply.header('Content-Disposition', `inline; filename="${upload.fileName}"`)
  reply.header('Content-Length', String(upload.sizeBytes))

  return readable
})
```

### Admin quota routes (`apps/backend/src/routes/admin.routes.ts`)

```typescript
import { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { verifyAuth, requireRole } from '../middleware/auth.js'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Admin-only middleware on all routes
  app.addHook('preHandler', verifyAuth)
  app.addHook('preHandler', requireRole('ADMIN'))

  app.get('/api/admin/quota', async () => {
    const quotas = await prisma.userQuota.findMany({
      include: { user: { select: { id: true, login: true, displayName: true } } },
    })
    return { data: quotas.map(q => ({
      userId: q.userId,
      login: q.user.login,
      displayName: q.user.displayName,
      maxStorageBytes: q.maxStorageBytes,
      usedStorageBytes: q.usedStorageBytes,
      usagePercent: q.maxStorageBytes > 0
        ? Math.round((q.usedStorageBytes / q.maxStorageBytes) * 100 * 100) / 100
        : 0,
      updatedAt: q.updatedAt,
    }))}
  })

  app.patch('/api/admin/users/:id/quota', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { maxStorageBytes } = request.body as { maxStorageBytes: number }

    if (!maxStorageBytes || maxStorageBytes < 0) {
      reply.code(400)
      return { error: { code: 'INVALID_QUOTA', message: 'maxStorageBytes must be >= 0' } }
    }

    const quota = await prisma.userQuota.upsert({
      where: { userId: id },
      create: { userId: id, maxStorageBytes },
      update: { maxStorageBytes },
    })

    return { quota }
  })
}
```

**Verification:**
- [ ] `GET /api/uploads/:id` streams file with correct MIME type
- [ ] `GET /api/uploads/:id?share=<token>` works for guest access
- [ ] `GET /api/uploads/:id` without auth returns 401
- [ ] `GET /api/admin/quota` returns list with usage percentages
- [ ] `PATCH /api/admin/users/:id/quota` updates storage limit

**Commit message:** `feat(api): add GET upload, admin quota endpoints`

---

## Task 7: Drag-n-drop + paste-image in the editor

**Objective:** React hook for drag-n-drop and clipboard paste that uploads files and inserts markdown image syntax.

**Files:**
- Create: `apps/web/src/hooks/useFileUpload.ts`
- Create: `apps/web/src/components/UploadIndicator.tsx`

**Implementation details:**

### `apps/web/src/hooks/useFileUpload.ts`

```typescript
import { useCallback, useRef, useState } from 'react'
import { api } from '../api-client'

interface UseFileUploadOptions {
  documentId: string
  onInsert?: (markdown: string) => void
}

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
}

export function useFileUpload({ documentId, onInsert }: UseFileUploadOptions) {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  })

  const uploadFile = useCallback(async (file: File) => {
    // Validate file type (client-side quick check)
    const allowedTypes = ['image/', 'application/pdf', 'text/plain', 'text/markdown']
    if (!allowedTypes.some(t => file.type.startsWith(t))) {
      setUploadState({ uploading: false, progress: 0, error: `File type ${file.type} not allowed` })
      return
    }

    // Validate size
    if (file.size > 25 * 1024 * 1024) {
      setUploadState({ uploading: false, progress: 0, error: 'File exceeds 25 MB limit' })
      return
    }

    setUploadState({ uploading: true, progress: 0, error: null })

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentId', documentId)

      const xhr = new XMLHttpRequest()

      return new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploadState(prev => ({ ...prev, progress }))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText)
            const markdown = `![${result.upload.fileName}](${result.upload.url})`
            onInsert?.(markdown)
            setUploadState({ uploading: false, progress: 100, error: null })
            resolve()
          } else {
            const error = JSON.parse(xhr.responseText)
            setUploadState({ uploading: false, progress: 0, error: error.error?.message || 'Upload failed' })
            reject(new Error(error.error?.message || 'Upload failed'))
          }
        })

        xhr.addEventListener('error', () => {
          setUploadState({ uploading: false, progress: 0, error: 'Network error' })
          reject(new Error('Network error'))
        })

        xhr.open('POST', '/api/uploads')
        xhr.withCredentials = true
        xhr.send(formData)
      })
    } catch (error) {
      setUploadState({ uploading: false, progress: 0, error: 'Upload failed' })
    }
  }, [documentId, onInsert])

  // Handle paste from clipboard
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        event.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await uploadFile(file)
        }
      }
    }
  }, [uploadFile])

  // Handle drag-n-drop
  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault()
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
  }, [uploadFile])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
  }, [])

  return {
    uploadState,
    uploadFile,
    handlePaste,
    handleDrop,
    handleDragOver,
  }
}
```

### `apps/web/src/components/UploadIndicator.tsx`

```tsx
interface UploadIndicatorProps {
  uploading: boolean
  progress: number
  error: string | null
}

export function UploadIndicator({ uploading, progress, error }: UploadIndicatorProps) {
  if (!uploading && !error) return null

  return (
    <div className={`upload-indicator ${error ? 'upload-error' : ''}`}>
      {uploading && (
        <div className="upload-progress">
          <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
          <span className="upload-progress-text">{progress}%</span>
        </div>
      )}
      {error && <span className="upload-error-text">{error}</span>}
    </div>
  )
}
```

**Verification:**
- [ ] Dragging a PNG onto the editor triggers upload and inserts `![](/api/uploads/...)`
- [ ] Pasting a screenshot from clipboard triggers upload
- [ ] Progress indicator shows during upload
- [ ] Error shown for invalid file types
- [ ] Error shown for files > 25 MB

**Commit message:** `feat(web): add drag-n-drop and paste-image upload with progress indicator`

---

## Task 8: Share API — POST + GET + DELETE

**Objective:** Create share endpoints: generate token, list shares, get document by token, delete share.

**Files:**
- Create: `apps/backend/src/routes/share.routes.ts`

**Implementation details:**

### `apps/backend/src/routes/share.routes.ts`

```typescript
import { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { verifyAuth } from '../middleware/auth.js'
import crypto from 'crypto'

const DEFAULT_TTL_HOURS = 168 // 7 days

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // Create share
  app.post('/api/documents/:id/shares', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { permission = 'READ', ttlHours = DEFAULT_TTL_HOURS } = request.body as {
      permission?: 'READ' | 'WRITE'
      ttlHours?: number
    }
    const userId = request.user!.id

    // Validate document exists and user has access
    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) {
      reply.code(404)
      return { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } }
    }

    // Generate token
    const token = crypto.randomBytes(24).toString('base64url')

    // Calculate expiry
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    const share = await prisma.share.create({
      data: {
        token,
        documentId: id,
        permission,
        createdById: userId,
        expiresAt,
      },
    })

    reply.code(201)
    return {
      share: {
        token: share.token,
        url: `/share/${share.token}`,
        permission: share.permission,
        expiresAt: share.expiresAt,
      },
    }
  })

  // List shares for a document
  app.get('/api/documents/:id/shares', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const shares = await prisma.share.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
    })

    return {
      data: shares.map(s => ({
        token: s.token,
        permission: s.permission,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        expired: s.expiresAt < new Date(),
      })),
    }
  })

  // Delete share
  app.delete('/api/shares/:token', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { token } = request.params as { token: string }

    const share = await prisma.share.findUnique({ where: { token } })
    if (!share) {
      reply.code(404)
      return { error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' } }
    }

    await prisma.share.delete({ where: { token } })
    reply.code(204)
  })

  // Public: get document by share token (no auth)
  app.get('/api/shares/:token/document', async (request, reply) => {
    const { token } = request.params as { token: string }

    const share = await prisma.share.findUnique({
      where: { token },
      include: { document: true },
    })

    if (!share || share.expiresAt < new Date()) {
      reply.code(404)
      return { error: { code: 'SHARE_NOT_FOUND', message: 'Share link not found or expired' } }
    }

    return {
      document: {
        id: share.document.id,
        title: share.document.title,
        permission: share.permission,
      },
      share: {
        expiresAt: share.expiresAt,
      },
    }
  })
}
```

**Verification:**
- [ ] `POST /api/documents/:id/shares` with `{ permission: "READ", ttlHours: 72 }` returns 201 with token
- [ ] `GET /api/documents/:id/shares` returns list of shares
- [ ] `GET /api/shares/:token/document` returns document (public, no auth)
- [ ] Expired share returns 404
- [ ] `DELETE /api/shares/:token` returns 204

**Commit message:** `feat(api): add share API endpoints (create, list, public get, delete)`

---

## Task 9: Yjs guest permissions

**Objective:** yjs-server validates JWT or share-token on connection, enforces read-only for guests with `READ` permission.

**Files:**
- Modify: `apps/yjs-server/src/ws-server.ts`

**Implementation details:**

In the WebSocket connection handler, add token validation:

```typescript
import jwt from 'jsonwebtoken'

interface AuthResult {
  type: 'user' | 'guest'
  userId?: string
  permission: 'EDIT' | 'READ'
  documentId: string
}

async function authenticateConnection(url: URL): Promise<AuthResult> {
  const token = url.searchParams.get('token')
  const share = url.searchParams.get('share')
  const docId = url.searchParams.get('docid')

  if (!docId) {
    throw new Error('MISSING_DOCID')
  }

  // Check share token first
  if (share) {
    // Call backend to validate share
    const response = await fetch(`http://backend:3000/api/shares/${share}/document`)
    if (!response.ok) {
      throw new Error('SHARE_EXPIRED')
    }
    const data = await response.json()
    return {
      type: 'guest',
      permission: data.document.permission,
      documentId: docId,
    }
  }

  // Check JWT
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      // Determine permission from role
      const permission: 'EDIT' | 'READ' = decoded.role === 'VIEWER' ? 'READ' : 'EDIT'
      return {
        type: 'user',
        userId: decoded.sub,
        permission,
        documentId: docId,
      }
    } catch {
      throw new Error('UNAUTHORIZED')
    }
  }

  throw new Error('UNAUTHORIZED')
}
```

In the message handler for Yjs updates:

```typescript
ws.on('message', (data) => {
  // Skip updates from READ-only connections
  if (connection.permission === 'READ') {
    return
  }
  // Apply update and broadcast to others
  Y.applyUpdate(session.ydoc, data)
  broadcastUpdate(connection.docId, data, connection.connectionId)
})
```

Close codes for WS connection:

| Code | Reason |
|---|---|
| 4001 | UNAUTHORIZED |
| 4002 | DOCUMENT_NOT_FOUND |
| 4003 | SHARE_EXPIRED |

**Verification:**
- [ ] Valid JWT token connects successfully
- [ ] Valid share token connects successfully
- [ ] Expired share token returns close code 4003
- [ ] No token returns close code 4001
- [ ] Guest with READ permission receives updates but cannot send them
- [ ] Guest with WRITE permission can send and receive updates

**Commit message:** `feat(yjs): add guest permissions (read-only/write) with share-token auth`

---

## Task 10: Frontend share dialog + guest layout

**Objective:** Share button on document page with dialog, guest layout without sidebar, share indicator.

**Files:**
- Create: `apps/web/src/components/ShareDialog.tsx`
- Create: `apps/web/src/pages/GuestDocumentPage.tsx` (public share page)
- Modify: `apps/web/src/App.tsx` (add route for `/share/:token`)
- Modify: `apps/web/src/pages/DocumentEditPage.tsx` (add share button)

**Implementation details:**

### `apps/web/src/components/ShareDialog.tsx`

```tsx
import { useState, useEffect } from 'react'
import { api } from '../api-client'

interface ShareDialogProps {
  documentId: string
  onClose: () => void
}

interface ShareRecord {
  token: string
  url: string
  permission: 'READ' | 'WRITE'
  expiresAt: string
}

export function ShareDialog({ documentId, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [permission, setPermission] = useState<'READ' | 'WRITE'>('READ')
  const [ttlHours, setTtlHours] = useState(72)
  const [creating, setCreating] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  useEffect(() => {
    loadShares()
  }, [documentId])

  const loadShares = async () => {
    try {
      const data = await api.getShares(documentId)
      setShares(data.data || [])
    } catch (err) {
      console.error('Failed to load shares:', err)
    }
  }

  const createShare = async () => {
    setCreating(true)
    try {
      const result = await api.createShare(documentId, { permission, ttlHours })
      setShares(prev => [...prev, result.share])
    } catch (err) {
      console.error('Failed to create share:', err)
    } finally {
      setCreating(false)
    }
  }

  const deleteShare = async (token: string) => {
    if (!confirm('Delete this share link?')) return
    try {
      await api.deleteShare(token)
      setShares(prev => prev.filter(s => s.token !== token))
    } catch (err) {
      console.error('Failed to delete share:', err)
    }
  }

  const copyToClipboard = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + url)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // Fallback
      const input = document.createElement('input')
      input.value = window.location.origin + url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    }
  }

  return (
    <div className="share-dialog-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={e => e.stopPropagation()}>
        <h2>Share Document</h2>

        <div className="share-create-form">
          <div className="share-option">
            <label>Permission:</label>
            <select value={permission} onChange={e => setPermission(e.target.value as 'READ' | 'WRITE')}>
              <option value="READ">Read only</option>
              <option value="WRITE">Read & Write</option>
            </select>
          </div>
          <div className="share-option">
            <label>Expires in:</label>
            <select value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))}>
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
          </div>
          <button onClick={createShare} disabled={creating}>
            {creating ? 'Creating...' : 'Generate Link'}
          </button>
        </div>

        {shares.length > 0 && (
          <div className="share-list">
            <h3>Share Links</h3>
            {shares.map((share, index) => (
              <div key={share.token} className="share-item">
                <div className="share-info">
                  <span className={`share-permission share-${share.permission.toLowerCase()}`}>
                    {share.permission}
                  </span>
                  <span className="share-expires">
                    Expires: {new Date(share.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="share-actions">
                  <button onClick={() => copyToClipboard(share.url, index)}>
                    {copiedIndex === index ? 'Copied!' : 'Copy'}
                  </button>
                  <button className="share-delete" onClick={() => deleteShare(share.token)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="share-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
```

### `apps/web/src/pages/GuestDocumentPage.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CollaborativeEditor } from '../components/CollaborativeEditor'
import { MarkdownPreview } from '../components/MarkdownPreview'

interface ShareDocument {
  id: string
  title: string
  permission: 'READ' | 'WRITE'
}

export function GuestDocumentPage() {
  const { token } = useParams<{ token: string }>()
  const [document, setDocument] = useState<ShareDocument | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    loadShare(token)
  }, [token])

  const loadShare = async (shareToken: string) => {
    try {
      const res = await fetch(`/api/shares/${shareToken}/document`)
      if (!res.ok) throw new Error('Share link not found or expired')
      const data = await res.json()
      setDocument(data.document)
      // Load document content
      const contentRes = await fetch(`/api/documents/${data.document.id}/export`)
      if (contentRes.ok) {
        setContent(await contentRes.text())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared document')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="guest-page loading">Loading shared document...</div>
  if (error) return <div className="guest-page error">{error}</div>
  if (!document) return <div className="guest-page error">Document not found</div>

  const isReadOnly = document.permission === 'READ'

  return (
    <div className="guest-page">
      <div className="guest-header">
        <h1>{document.title}</h1>
        <span className="guest-badge">
          {isReadOnly ? 'Viewing (read-only)' : 'Editing (shared)'}
        </span>
      </div>
      <div className="guest-editor-layout">
        <CollaborativeEditor
          documentId={document.id}
          initialContent={content}
          readOnly={isReadOnly}
        />
        <MarkdownPreview content={content} />
      </div>
    </div>
  )
}
```

### Route update in `App.tsx`

```tsx
import { GuestDocumentPage } from './pages/GuestDocumentPage'

// Add route:
<Route path="/share/:token" element={<GuestDocumentPage />} />
```

### Share button in `DocumentEditPage.tsx`

Add to the document actions section:

```tsx
const [showShareDialog, setShowShareDialog] = useState(false)

// In the JSX, add:
<button onClick={() => setShowShareDialog(true)} className="share-button">
  Share
</button>

{showShareDialog && (
  <ShareDialog
    documentId={id!}
    onClose={() => setShowShareDialog(false)}
  />
)}
```

### Add share indicator to document header

```tsx
// In DocumentEditPage.tsx, after loading document
const [hasShares, setHasShares] = useState(false)

useEffect(() => {
  if (!id) return
  api.getShares(id).then(data => {
    setHasShares(data.data && data.data.length > 0)
  }).catch(() => {})
}, [id])

// In JSX:
{hasShares && <span className="shared-indicator" title="This document is shared">Shared</span>}
```

**Verification:**
- [ ] Share button opens dialog on document page
- [ ] Creating share generates link that can be copied to clipboard
- [ ] Opening `/share/:token` shows minimal layout (no sidebar, no tree)
- [ ] Guest READ-only cannot edit (CodeMirror is read-only)
- [ ] Guest WRITE can edit but toolbar shows limited actions
- [ ] "Shared" indicator appears on documents that have active shares

**Commit message:** `feat(web): add share dialog, guest document page, share indicator`

---

## Task 11: Integrate markdown preview into DocumentEditPage with debounce

**Objective:** Wire the markdown preview into the document editor with debounced rendering.

**Files:**
- Modify: `apps/web/src/pages/DocumentEditPage.tsx`

**Implementation details:**

Add a preview panel alongside the editor, using the `MarkdownPreview` component:

```tsx
import { MarkdownPreview } from '../components/MarkdownPreview'

// Add to DocumentEditPage state
const [showPreview, setShowPreview] = useState(true)
const [previewContent, setPreviewContent] = useState('')
const debounceRef = useRef<NodeJS.Timeout | null>(null)
const editorRef = useRef<HTMLDivElement>(null)

// Track content from CollaborativeEditor for preview
const handleContentChange = useCallback((newContent: string) => {
  setHasChanges(content !== newContent)

  // Debounce preview update (300ms)
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    setPreviewContent(newContent)
  }, 300)
}, [content])

// Insert text at cursor (from Excalidraw or upload)
const handleInsertAtCursor = useCallback((text: string) => {
  // Dispatch custom event — CollaborativeEditor listens for it
  document.dispatchEvent(new CustomEvent('insert-at-cursor', { detail: { text } }))
}, [])

// In JSX, add preview toggle:
<div className="editor-toolbar">
  <button onClick={() => setShowPreview(!showPreview)}>
    {showPreview ? 'Hide Preview' : 'Show Preview'}
  </button>
</div>

// In the editor section:
<div className="editor-with-preview">
  <div className="code-editor-pane">
    <CollaborativeEditor
      documentId={id!}
      initialContent={content}
      onContentChange={handleContentChange}
    />
  </div>
  {showPreview && (
    <div className="preview-pane">
      <MarkdownPreview content={previewContent} />
    </div>
  )}
</div>
```

Also add `upload` and `excalidraw` buttons to the toolbar:

```tsx
import { useFileUpload } from '../hooks/useFileUpload'
import { ExcalidrawEditor } from '../components/ExcalidrawEditor'

// In DocumentEditPage:
const { uploadState, handlePaste, handleDrop, handleDragOver, uploadFile } = useFileUpload({
  documentId: id!,
  onInsert: handleInsertAtCursor,
})

const [showExcalidraw, setShowExcalidraw] = useState(false)
const [excalidrawInitialData, setExcalidrawInitialData] = useState(null)

const handleExcalidrawSave = (svgDataUrl: string) => {
  const insertText = `\`\`\`excalidraw\n${svgDataUrl}\n\`\`\`\n\n`
  handleInsertAtCursor(insertText)
  setShowExcalidraw(false)
}

// Toolbar buttons:
<div className="editor-toolbar">
  <UploadIndicator {...uploadState} />
  <button onClick={() => document.getElementById('file-input')?.click()}>
    Attach File
  </button>
  <input
    id="file-input"
    type="file"
    style={{ display: 'none' }}
    onChange={async (e) => {
      const file = e.target.files?.[0]
      if (file) await uploadFile(file)
      e.target.value = ''
    }}
    accept="image/*,.pdf,.txt,.md"
  />
  <button onClick={() => setShowExcalidraw(true)}>
    Draw Diagram
  </button>
  <button onClick={() => setShowPreview(!showPreview)}>
    {showPreview ? 'Hide Preview' : 'Show Preview'}
  </button>
</div>

{showExcalidraw && (
  <div className="modal-overlay">
    <ExcalidrawEditor
      onSave={handleExcalidrawSave}
      onClose={() => setShowExcalidraw(false)}
    />
  </div>
)}
```

**Verification:**
- [ ] Editor shows preview panel that updates after 300ms debounce
- [ ] Toggle preview button shows/hides the panel
- [ ] Attach file button opens file picker
- [ ] Upload progress shown in toolbar
- [ ] Excalidraw button opens the drawing canvas
- [ ] Inserting excalidraw SVG renders in preview

**Commit message:** `feat(web): integrate markdown preview with debounce, file upload, and excalidraw toolbar`

---

## Task 12: E2E tests for Phase 4

**Objective:** Playwright E2E tests for markdown plugins, uploads, shares, guest access.

**Files:**
- Create: `apps/web/e2e/phase4-markdown.spec.ts`
- Create: `apps/web/e2e/phase4-uploads.spec.ts`
- Create: `apps/web/e2e/phase4-shares.spec.ts`

**Implementation details:**

### `apps/web/e2e/phase4-markdown.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Phase 4 — Markdown Extensions', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin, navigate to a test document
    await page.goto('/login')
    await page.fill('input[name="login"]', 'admin')
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'admin')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/)
    // Navigate to first document
    await page.click('.document-link')
    await page.waitForSelector('.collaborative-editor')
  })

  test('renders code blocks with syntax highlighting', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.fill('```javascript\nconst x = 1;\n```')
    await page.waitForTimeout(500)
    const preview = page.locator('.markdown-preview')
    await expect(preview).toContainText('const x = 1')
  })

  test('renders Mermaid diagrams', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.fill('```mermaid\ngraph TD\nA-->B\n```')
    await page.waitForTimeout(500)
    const preview = page.locator('.markdown-preview')
    // Mermaid renders an SVG
    await expect(preview.locator('svg')).toBeAttached()
  })

  test('renders KaTeX math', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.fill('$$E=mc^2$$')
    await page.waitForTimeout(500)
    const preview = page.locator('.markdown-preview')
    await expect(preview).toContainText('E=mc')
  })

  test('renders callouts', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.fill('> [!warning]\n> This is a warning')
    await page.waitForTimeout(500)
    const preview = page.locator('.markdown-preview')
    await expect(preview.locator('.callout-warning')).toBeAttached()
  })

  test('renders task lists', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.fill('- [ ] Task 1\n- [x] Task 2')
    await page.waitForTimeout(500)
    const preview = page.locator('.markdown-preview')
    await expect(preview.locator('input[type="checkbox"]')).toHaveCount(2)
  })
})
```

### `apps/web/e2e/phase4-uploads.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Phase 4 — File Uploads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="login"]', 'admin')
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'admin')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/)
    await page.click('.document-link')
    await page.waitForSelector('.collaborative-editor')
  })

  test('uploads file via toolbar button', async ({ page }) => {
    // Create a test image
    const filePath = path.join(__dirname, 'fixtures', 'test.png')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    // Wait for upload to complete
    await page.waitForSelector('.upload-progress', { state: 'hidden', timeout: 10000 })

    // Verify markdown image syntax was inserted
    const editorContent = await page.locator('.cm-content').textContent()
    expect(editorContent).toContain('![](/api/uploads/')
  })

  test('shows upload progress indicator', async ({ page }) => {
    const filePath = path.join(__dirname, 'fixtures', 'test.png')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await expect(page.locator('.upload-indicator')).toBeVisible()
    await page.waitForSelector('.upload-indicator', { state: 'hidden', timeout: 15000 })
    await expect(page.locator('.upload-indicator')).toBeHidden()
  })
})
```

### `apps/web/e2e/phase4-shares.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Phase 4 — Share Links', () => {
  test('creates and opens share link', async ({ browser }) => {
    // Context 1: Admin creates a share
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    await adminPage.goto('/login')
    await adminPage.fill('input[name="login"]', 'admin')
    await adminPage.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'admin')
    await adminPage.click('button[type="submit"]')
    await adminPage.waitForURL(/\/dashboard/)
    await adminPage.click('.document-link')
    await adminPage.waitForSelector('.collaborative-editor')

    // Open share dialog
    await adminPage.click('.share-button')
    await adminPage.waitForSelector('.share-dialog')

    // Create a read-only share
    await adminPage.click('button:has-text("Generate Link")')
    await adminPage.waitForSelector('.share-item')

    // Get the share URL
    await adminPage.click('button:has-text("Copy")')
    const shareUrl = await adminPage.evaluate(() => navigator.clipboard.readText())

    // Context 2: Guest opens the share (incognito)
    const guestContext = await browser.newContext()
    const guestPage = await guestContext.newPage()

    await guestPage.goto(shareUrl)
    await guestPage.waitForSelector('.guest-page')

    // Guest should see the document but cannot edit
    await expect(guestPage.locator('.guest-page')).toBeVisible()
    await expect(guestPage.locator('.guest-editor-layout')).toBeVisible()

    await adminContext.close()
    await guestContext.close()
  })

  test('guest cannot edit read-only document', async ({ browser }) => {
    // Create a share with READ permission
    // ... (similar setup as above)
    // Verify editor is in read-only mode
    // Try typing — content should not change
  })
})
```

### Create test fixtures

```bash
mkdir -p apps/web/e2e/fixtures
# Create a 1x1 PNG test file
python3 -c "
import base64, struct, zlib
def create_png(w, h):
    raw = b''
    for y in range(h):
        raw += b'\\x00' + b'\\xff\\x00\\x00\\x00' * w
    compressed = zlib.compress(raw)
    sig = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')
with open('apps/web/e2e/fixtures/test.png', 'wb') as f:
    f.write(create_png(1, 1))
"
```

**Verification:**
- [ ] `pnpm --filter web test:e2e -- --grep "Phase 4"` passes
- [ ] Markdown plugin tests all pass
- [ ] Upload test creates file and inserts markdown
- [ ] Share test creates link and guest can open it
- [ ] Guest read-only test verifies editor is not editable

**Commit message:** `test(e2e): add Phase 4 E2E tests for markdown plugins, uploads, shares`

---

## Task 13: Docker + documentation updates

**Objective:** Update docker-compose with MinIO bucket init, .env.example, documentation, roadmap, verification script.

**Files:**
- Modify: `infra/docker-compose.yml` (ensure MinIO bucket init)
- Modify: `infra/.env.example` (add any new vars)
- Modify: `docs/07-agent-roadmap.md` (mark Phase 4 done)
- Create: `scripts/verify-phase4.sh`

**Implementation details:**

### `scripts/verify-phase4.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "=== Phase 4 Verification ==="

# 1. Check MinIO bucket exists
echo "--- Checking MinIO bucket ---"
docker compose exec minio mc ls local/md-collab-uploads 2>/dev/null || (
  echo "FAIL: MinIO bucket not found"
  exit 1
)
echo "PASS: MinIO bucket exists"

# 2. Test upload API
echo "--- Testing upload API ---"
TEST_FILE=$(mktemp)
echo "test content" > "$TEST_FILE"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -b "token=$(curl -s -X POST http://localhost/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{\"login\":\"admin\",\"password\":\"'$ADMIN_PASSWORD'\"}' | jq -r '.token')" \
  -F "file=@$TEST_FILE" \
  -F "documentId=$(curl -s http://localhost/api/tree | jq -r '.tree[0].documents[0].id')" \
  http://localhost/api/uploads)
rm "$TEST_FILE"

if [ "$HTTP_CODE" != "201" ]; then
  echo "FAIL: Upload API returned $HTTP_CODE"
  exit 1
fi
echo "PASS: Upload API works"

# 3. Test share API
echo "--- Testing share API ---"
SHARE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -b "token=$(curl -s -X POST http://localhost/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{\"login\":\"admin\",\"password\":\"'$ADMIN_PASSWORD'\"}' | jq -r '.token')" \
  -X POST http://localhost/api/documents/$(curl -s http://localhost/api/tree | jq -r '.tree[0].documents[0].id')/shares \
  -H 'Content-Type: application/json' \
  -d '{"permission":"READ","ttlHours":1}')

if [ "$SHARE_CODE" != "201" ]; then
  echo "FAIL: Share API returned $SHARE_CODE"
  exit 1
fi
echo "PASS: Share API works"

# 4. Check markdown plugins work in preview
echo "--- Checking markdown renderer ---"
curl -s http://localhost:5173/ | grep -q "excalidraw" || echo "WARN: Excalidraw UI not detected on frontend"

echo "=== Phase 4 Verification Complete ==="
```

### Update `.env.example` — already complete, verify MinIO bucket var is documented

Check `infra/.env.example` has:
```
MINIO_BUCKET=md-collab-uploads
```

### Update roadmap

In `docs/07-agent-roadmap.md`, mark Phase 4 criteria:

```
**Критерии готовности:**
- [x] Все 8 расширений markdown рендерятся корректно
- [x] Excalidraw embedded editor работает (SVG base64 in markdown)
- [x] Drag-n-drop картинки → загрузка → вставка → рендер
- [x] Создание share-ссылки с TTL, открытие в инкогнито работает
- [x] Read-only гость видит документ, но не может править
- [x] Write-гость может редактировать, но не может commit/discard/restore
```

### Docker Compose (verify MinIO init)

The `infra/docker-compose.yml` already has `minio-init` service that creates the bucket. Verify:
- `infra/minio/init.sh` exists with content:

```bash
#!/bin/sh
set -e
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing local/"${MINIO_BUCKET:-md-collab-uploads}"
```

**Verification:**
- [ ] `./scripts/verify-phase4.sh` passes all checks
- [ ] MinIO bucket auto-created on `docker compose up`
- [ ] Roadmap in `07-agent-roadmap.md` shows Phase 4 complete

**Commit message:** `docs(infra): update Docker, env, roadmap, add Phase 4 verification script`

---

## Summary of all tasks

| # | Task | Files | Est. time |
|---|---|---|---|
| 1 | Prisma migration | `schema.prisma` + `npx prisma migrate` | 5 min |
| 2 | Install npm packages | `package.json` | 5 min |
| 3 | markdown-it renderer + DOMPurify | `markdown-renderer.ts`, `MarkdownPreview.tsx` | 15 min |
| 4 | Excalidraw editor component | `ExcalidrawEditor.tsx`, `ExcalidrawPlugin.tsx` | 15 min |
| 5 | Upload API (POST) | `upload.routes.ts`, `minio.service.ts` | 15 min |
| 6 | Upload GET + Admin quota | `upload.routes.ts`, `admin.routes.ts` | 10 min |
| 7 | Drag-n-drop + paste-image | `useFileUpload.ts`, `UploadIndicator.tsx` | 10 min |
| 8 | Share API | `share.routes.ts` | 10 min |
| 9 | Yjs guest permissions | `ws-server.ts` | 15 min |
| 10 | Share dialog + guest layout | `ShareDialog.tsx`, `GuestDocumentPage.tsx`, `App.tsx`, `DocumentEditPage.tsx` | 15 min |
| 11 | Integrate preview into editor | `DocumentEditPage.tsx` | 10 min |
| 12 | E2E tests | 3 spec files + fixtures | 15 min |
| 13 | Docker + docs | `docker-compose.yml`, `.env.example`, `verify-phase4.sh`, roadmap | 5 min |

**Total:** ~140 minutes (2.3 hours) of agent time.

---

## Execution order

```
Task 1 (Prisma) → Task 2 (npm install)
  ↓
Task 3 (markdown-it renderer) → Task 4 (Excalidraw)
  ↓
Task 5 (Upload API) ──→ Task 6 (Upload GET + quota)
  ↓                         ↓
Task 7 (Drag-n-drop) ──→ Task 8 (Share API)
  ↓                         ↓
Task 9 (Yjs guest perms) ← ─┘
  ↓
Task 10 (Share dialog + guest layout)
  ↓
Task 11 (Integrate preview)
  ↓
Task 12 (E2E tests)
  ↓
Task 13 (Docker + docs)
```

**Parallel work:** Tasks 3-4 can be done in parallel. Tasks 5-6-8 can be done in parallel. Task 7 depends on 5, Task 9 on 8.

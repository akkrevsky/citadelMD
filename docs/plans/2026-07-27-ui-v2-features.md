# 2026-07-27 — UI v2 Features

14 feature requests. All frontend-only except folder settings (git vs snapshot).

## F1 — Folder create in sidebar tree
- Folder context menu / "+" button per folder
- `POST /api/folders` already works, just needs UI wiring
- `POST /api/folders/:folderId/documents` already works

## F2 — Attachments / Assets library
- Sidebar tab: "Assets" (tree switcher: Folders | Assets)
- `GET /api/uploads` endpoint (add to backend) listing all user uploads
- Grid view: thumbnail + name + size + delete button

## F3 — Single click = preview, double = new tab
- Change tree doc click: `onClick` = navigate (replace tab), `onDoubleClick` = pinTab
- Remove double-click semantics from tabs (simplify to close only)

## F4 — Folder settings (git vs snapshot)
- Schema: add `mode: 'git' | 'snapshot'` to `Folder` model
- Right-click folder → Settings dialog → toggle
- Backend: if `mode === 'snapshot'` → don't git commit, just write
- This needs backend changes

## F5 — No commit button for non-git files
- TabBar: check document metadata → hide commit/save if `mode === 'snapshot'`

## F6 — Header truncated title + tooltip
- `title.slice(0, 25) + (title.length > 25 ? '...' : '')`
- `title={doc.filePath}` on hover

## F7 — Update date on save
- `PATCH /api/documents/:id` update `updatedAt` when document changes
- Or client-side: optimistic update of `updatedAt` field on sidebar

## F8 — Unsaved indicator as * on tabs
- Tab name: `${hasChanges ? '* ' : ''}${title}`

## F9 — Unsaved docs highlighted in sidebar
- Use `unsaved.ts` pub/sub → add `.unsaved` class with bold/color indicator

## F10 — Sidebar hide leaves toggle button space
- Current toggle is fixed top-left — verify it stays visible when collapsed
- Ensure `.sidebar-collapsed` still shows toggle button at left edge

## F11 — LaTeX formulas
- markdown-it-katex already installed? Check.
- If not, add `markdown-it-katex` + katex CSS in preview
- Or use `remark-math` + `remark-html`

## F12 — Close other tabs
- TabBar context menu: "Close Others", "Close Left", "Close Right"
- TabBarMain: add `onCloseOthers`, `onCloseLeft`, `onCloseRight` methods

## F13 — Inline save indicator (status bar dot, already partially done)
- Already implemented — verify it works

## Order of implementation:
1. F6 — Header truncated names (quick)
2. F7 — Update date/time on save (quick)
3. F8 — * on unsaved tabs (quick)
4. F9 — Highlight unsaved in sidebar (quick)
5. F10 — Verify hide toggle (quick)
6. F3 — Change click semantics
7. F12 — Close other tabs
8. F11 — LaTeX formulas
9. F1 — Create folders/files
10. F2 — Assets library
11. F4/F5 — Folder settings (git vs snapshot)

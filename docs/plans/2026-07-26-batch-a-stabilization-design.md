# Batch A: Stabilization + Design Foundation + Quick Wins — Design Spec

Date: 2026-07-26
Parent: [UI Improvement Recommendations](./2026-07-26-ui-improvement-recommendations.md)
Status: approved, ready for implementation plan

## Scope

22 changes in ~12 files, organized into 3 phases:

```
Phase 1: Design tokens (D1–D5)
    ↓
Phase 2: Bug fixes using tokens (S1–S9)
    ↓
Phase 3: Editor features on clean base (E1–E6, E9–E10, W1–W2, N6, K1)
```

---

## Phase 1: Design Tokens

### D1 — Spacing scale

Add to `apps/web/src/styles.css`, inside `:root`:

```css
:root {
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
}
```

Replace all ad-hoc padding/margin values in `styles.css`, `editor.css`, `toolbar.css`, `statusbar.css`, `tabbar.css` with `var(--space-*)`. Examples of mechanical replacements:
- `padding: 0.3rem 1rem` → `padding: var(--space-xs) var(--space-md)`
- `padding: 0.6rem 0.75rem` → `padding: var(--space-sm) var(--space-sm)`
- `margin-bottom: 24px` → `margin-bottom: var(--space-lg)`
- `padding: 24px 32px` → `padding: var(--space-lg) var(--space-xl)`
- `gap: 8px` → `gap: var(--space-sm)`

**Files touched:** `styles.css`, `editor.css`, `toolbar.css`, `statusbar.css`, `tabbar.css`

### D2 — Typography scale

Add to `:root`:

```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
}
```

Replace all font-size literals across the CSS files. Closest matches:
- `0.85rem` → `var(--text-sm)`
- `0.9rem` → `var(--text-sm)`
- `1rem` → `var(--text-base)`
- `1.15rem` → `var(--text-lg)`
- `1.5rem` → `var(--text-2xl)`
- `15px` → `var(--text-base)`
- `14px` → `var(--text-sm)`
- `13px` → `var(--text-xs)`
- `12px` → `var(--text-xs)`
- `11px` → `var(--text-xs)`

**Files touched:** `styles.css`, `editor.css`, `toolbar.css`, `statusbar.css`, `tabbar.css`

### D3 — Radius scale

Rename existing `--radius: 6px` to `--radius-md: 6px`. Add:

```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}
```

Replace all hardcoded `border-radius` values with `var(--radius-*)`.

**Files touched:** `styles.css`, `preview.css`, `tabbar.css`

### D4 — Font loading (merge with S6)

Add to `apps/web/index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
```

Add to `styles.css`:

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace;
}
```

Replace hardcoded font stacks in `styles.css` with `var(--font-mono)`.

**Files touched:** `index.html`, `styles.css`

### D5 — Semantic color tokens

Beyond the existing concrete color variables (`--color-bg`, `--color-surface`, etc.), add semantic aliases that all components reference:

```css
:root, [data-theme="dark"] {
  --color-primary: #58a6ff;
  --color-primary-hover: #79c0ff;
  --color-danger: #f85149;
  --color-success: #3fb950;
  --color-warning: #f0883e;
  --color-text-primary: #c9d1d9;
  --color-text-secondary: #8b949e;
  --color-text-muted: #484f58;
  --color-border: #30363d;
  --color-bg: #0d1117;
  --color-surface: #161b22;
  --color-surface-elevated: #21262d;
}

[data-theme="light"] {
  --color-primary: #0969da;
  --color-primary-hover: #0550ae;
  --color-danger: #cf222e;
  --color-success: #1a7f37;
  --color-warning: #9a6700;
  --color-text-primary: #1f2328;
  --color-text-secondary: #656d76;
  --color-text-muted: #8b949e;
  --color-border: #d0d7de;
  --color-bg: #f6f8fa;
  --color-surface: #ffffff;
  --color-surface-elevated: #f6f8fa;
}
```

Replace all direct hex color references in non-theme-aware components with `var(--color-*)`.

**Note:** The existing theme color variables in `styles.css` may have different names — harmonize to these semantic names, updating all references.

**Files touched:** `styles.css` (primary)

---

## Phase 2: Bug Fixes

### S1 — Fix dead `/dashboard` route

**File:** `apps/web/src/pages/DocumentEditPage.tsx`

Replace all 4 occurrences of `'/dashboard'` with `'/'`:
- Line 56 (tab close → navigate)
- Line 235 (back to dashboard button)
- Line 244 (back to dashboard after delete, if present)
- Line 313 (tabBar onTabClose handler)

### S2 — Wire up ShareDialog

**Files:** `apps/web/src/pages/DocumentEditPage.tsx`, `apps/web/src/components/ShareDialog.tsx`

1. Import `ShareDialog` in `DocumentEditPage.tsx`
2. Add a "Share" button in the document header action cluster (next to the existing Dashboard button)
3. Button toggles `showShareDialog` state → renders `<ShareDialog documentId={id} />`
4. Rewrite `ShareDialog.tsx` to use CSS custom properties instead of inline hex colors

### S3 — Selection-aware formatting toolbar

**Files:** `apps/web/src/pages/DocumentEditPage.tsx`, `apps/web/src/components/CollaborativeEditor.tsx`

Current: `onFormat` fires `CustomEvent('insert-at-cursor', { detail: { text }})` with literal string.
New: `onFormat` reads `view.state.selection` — if selection is non-empty, wraps it. Undo/Redo use `undo(view)` / `redo(view)` from `@codemirror/commands` instead of magic strings.

```typescript
// DocumentEditPage.tsx — replace the onFormat handler
const handleFormat = useCallback((syntax: string) => {
  window.dispatchEvent(new CustomEvent('format', { detail: { syntax } }))
}, [])

// CollaborativeEditor.tsx — replace the 'insert-at-cursor' listener
const formatListener = EditorView.updateListener.of((update) => {
  // Not applicable here — use keymap or Command pattern
})
```

Implementation approach (simpler than the current event-bus hack):
- Expose a `viewRef` from `CollaborativeEditor` (already exists as `editorViewRef`)
- `DocumentEditPage` calls methods on the ref directly instead of dispatching CustomEvents
- Or: use CodeMirror `keymap` and `Command` pattern — `insertBoldMark`, `insertItalicMark`, etc. bound to toolbar button clicks via a context or imperative handle

**Bold example:**
```typescript
function wrapSelection(view: EditorView, wrapper: string) {
  const { from, to } = view.state.selection.main
  if (from === to) {
    // No selection, insert placeholder
    const text = `${wrapper}text${wrapper}`
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + wrapper.length, head: from + wrapper.length + 4 } })
  } else {
    // Wrap selected text
    const selected = view.state.sliceDoc(from, to)
    view.dispatch({
      changes: [{ from, to, insert: `${wrapper}${selected}${wrapper}` }],
      selection: { anchor: from, head: to + wrapper.length * 2 }
    })
  }
}
```

### S4 — Fix create-document parent folder

**File:** `apps/web/src/pages/HomePage.tsx`

Line 19: instead of `folderId: tree[0].id`, pass the current folder context. Add a `selectedFolderId` prop or state and use it. The sidebar tree click should set the selected folder; the "+ New Document" button in the sidebar should create in the hovered/selected folder.

### S5 — Replace native alert/confirm with themed modals

**Files:** `apps/web/src/pages/DocumentEditPage.tsx`, `apps/web/src/pages/AdminUsersPage.tsx`

Replace:
- `alert('Please enter a commit message')` — inline validation message or toast
- `confirm('Are you sure...')` for discard — `<ConfirmModal>`
- `confirm('Are you sure you want to deactivate...')` in AdminUsersPage — `<ConfirmModal>`

New component: `apps/web/src/components/ConfirmModal.tsx`
- Props: `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`
- Renders a `<dialog>` or overlay with themed styling using design tokens
- New component: `apps/web/src/components/Toast.tsx`
- Props: `message`, `type` (error/warning/success)
- Renders at a fixed position, auto-dismisses after ~3s

### S6 — Load JetBrains Mono

Merged into D4 (font loading) — add Google Fonts link to `index.html`.

### S7 — Fix inline colors in components

**Files:**
- `apps/web/src/components/ShareDialog.tsx` — replace `#fff`, `#3b82f6`, `#f1f5f9` etc. with `var(--color-*)`
- `apps/web/src/components/ExcalidrawEditor.tsx` — replace `#94a3b8`, `#dc2626`, `#e2e8f0`, `#3b82f6` with `var(--color-*)`
- `apps/web/src/components/UploadIndicator.tsx` — replace `#f0f9ff`, `#e2e8f0`, `#3b82f6`, `#64748b`, `#dc2626` with `var(--color-*)`
- `apps/web/src/pages/GuestDocumentPage.tsx` — replace hardcoded hex with `var(--color-*)`

### S8 — Login gradient respects theme

**File:** `apps/web/src/styles.css` (line ~150)

Wrap the gradient in `[data-theme]` selectors:
```css
[data-theme="dark"] .login-page {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}
[data-theme="light"] .login-page {
  background: linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%);
}
```

Or: use a CSS custom property `--login-gradient` set per theme.

### S9 — Fix ExcalidrawEditor useState misuse

**File:** `apps/web/src/components/ExcalidrawEditor.tsx` (lines 15–23)

```typescript
// Before (broken):
const [{ default: Excalidraw }, setExcalidraw] = useState(() => { import('...') })

// After (correct):
const [Excalidraw, setExcalidraw] = useState<any>(null)
useEffect(() => {
  import('@excalidraw/excalidraw').then(m => setExcalidraw(() => m.default))
}, [])
```

---

## Phase 3: Editor Features

### E1 — Scroll-sync editor ↔ preview

**Files:** `apps/web/src/components/CollaborativeEditor.tsx`, `apps/web/src/components/MarkdownPreview.tsx`

Editor → Preview:
- Subscribe to `EditorView.scrollDOM` scroll event
- Compute `scrollRatio = scrollTop / (scrollHeight - clientHeight)`
- Pass `scrollRatio` as prop to `MarkdownPreview`
- Preview container: `scrollTop = scrollRatio * (scrollHeight - clientHeight)`

Preview → Editor (click-to-jump):
- Add `data-line="N"` attributes to markdown-rendered headings
- Click handler: find heading pos in editor via `@codemirror/language` syntax tree, then `EditorView.dispatch({selection})` + `scrollIntoView()`

### E2 — Outline / ToC pane

**File:** `apps/web/src/components/EditorToolbar.tsx` (or new `OutlinePane.tsx`)

- Use `@codemirror/language` `syntaxTree` to extract headings (H1–H6) with line numbers
- Render as a collapsible panel or dropdown from the toolbar
- Click heading → jump to position in editor
- Auto-highlight current heading based on cursor position

### E3 — Find & Replace

**File:** `apps/web/src/components/EditorToolbar.tsx`

- Add a Find button (magnifying glass icon) to toolbar
- On click: `view.dispatch({ effects: openSearchPanel.of(null) })` from `@codemirror/search`
- Also bind `Ctrl+H` / `Cmd+H` via `useEffect` keydown listener

### E4 — Vim/Emacs keymap toggle

**Files:** `apps/web/src/components/CollaborativeEditor.tsx`, `apps/web/src/pages/ProfilePage.tsx`

- Install `@replit/codemirror-vim` (npm package)
- Add `editorKeymap` field to User record (backend: Prisma schema + API; frontend: profile edit)
- In `CollaborativeEditor`, conditionally include `vim()` extension based on user preference
- Emacs: CodeMirror has `emacsStyle` keymap built-in
- Default: standard CodeMirror keybindings

### E5 — Ctrl+S for Save (Commit)

**File:** `apps/web/src/pages/DocumentEditPage.tsx`

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      commitDocument(id, message || 'Quick save')
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [id, message, commitDocument])
```

### E6 — Resizable split-view handle

**File:** `apps/web/src/styles/editor.css`, `apps/web/src/pages/DocumentEditPage.tsx`

- Add a `div.resize-handle` between editor and preview in split mode
- CSS: `cursor: col-resize`, `width: 4px`, `background: var(--color-border)`, hover highlight
- Drag logic: track `mousedown` → `mousemove` → update CSS variable `--editor-ratio` (from 0.2 to 0.8)
- Refs: `editorRef` and `previewRef` for the two panes, resize handle between them

### E9 — Syntax highlighting respects theme

**File:** `apps/web/src/components/CollaborativeEditor.tsx` (lines 14–38)

Current: hardcoded GitHub-dark palette.
New: read colors from CSS custom properties via `getComputedStyle(document.documentElement)` and apply to CodeMirror theme extension. Or define two CodeMirror theme extensions, one for each `[data-theme]`, and switch on theme change.

### E10 — Fix upload markdown generation

**File:** `apps/web/src/hooks/useFileUpload.ts`

```typescript
// Before:
return `![${fileName}](${url})`

// After:
const isImage = file.type.startsWith('image/')
return isImage ? `![${fileName}](${url})` : `[${fileName}](${url})`
```

### W1 — App-level keyboard shortcuts

**File:** `apps/web/src/App.tsx` (or new `useKeyboardShortcuts.ts` hook)

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save/commit current doc (E5) |
| `Ctrl+H` / `Cmd+H` | Find & Replace toggle (E3) |
| `Ctrl+E` / `Cmd+E` | Cycle view mode: source → split → preview (W2) |
| `Ctrl+K` / `Cmd+K` | Placeholder for command palette (N1, Batch B) |

### W2 — Ctrl+E cycle view mode

**File:** `apps/web/src/pages/DocumentEditPage.tsx`

```typescript
const VIEW_MODE_CYCLE = ['source', 'split', 'preview'] as const
function cycleViewMode(current: ViewMode): ViewMode {
  const idx = VIEW_MODE_CYCLE.indexOf(current)
  return VIEW_MODE_CYCLE[(idx + 1) % VIEW_MODE_CYCLE.length]
}
```

### N6 — Inline-editable document title

**File:** `apps/web/src/pages/DocumentEditPage.tsx`

Replace the static `<h1>` in `.document-header` with an `<input>` styled as a heading:

```tsx
<input
  className="document-title-input"
  value={doc.title}
  onChange={(e) => setDoc({ ...doc, title: e.target.value })}
  onBlur={() => updateDocument(id, { title: doc.title })}
/>
```

`updateDocument` already exists in the API client. Title is metadata in Postgres, not file content — safe to autosave on blur.

### K1 — System-auto theme

**File:** `apps/web/src/hooks/useTheme.tsx`

Add `prefers-color-scheme` listener:

```typescript
const [autoTheme, setAutoTheme] = useState<'dark' | 'light'>(
  () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
)

useEffect(() => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => setAutoTheme(e.matches ? 'dark' : 'light')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}, [])

// Effective theme: explicit override > system auto
const effectiveTheme = explicitTheme ?? autoTheme
```

The theme toggle in the toolbar changes `explicitTheme`. If `explicitTheme` is null (never set), follow system.

---

## Acceptance Criteria

1. `navigate('/dashboard')` no longer exists in the codebase — all nav goes to `/`
2. "Share" button visible in document editor header; clicking it opens ShareDialog
3. Bold button with text selected: wraps selection in `**`, cursor stays at end
4. New document respects the folder it was created from
5. No native `alert()` or `confirm()` calls — all user feedback uses themed components
6. JetBrains Mono renders in the editor (visible font difference)
7. Every component that previously used hardcoded hex colors now uses `var(--color-*)`
8. Login page gradient is different in dark vs light theme
9. ExcalidrawEditor uses `useEffect` for import (no StrictMode double-fire)
10. Design tokens (`--space-*`, `--text-*`, `--radius-*`) defined and used in all CSS files
11. Scroll-sync: scrolling editor scrolls preview proportionally
12. Outline/ToC: heading list visible from toolbar, click jumps to heading
13. Find & Replace: `Ctrl+H` opens search panel; toolbar button works
14. Vim/Emacs keymap selectable in profile, applied in editor
15. `Ctrl+S` commits the current document
16. Split-view has a draggable resize handle between panes
17. CodeMirror syntax colors match the active theme
18. Uploading a PDF inserts `[name](url)`, not `![name](url)`
19. `Ctrl+E` cycles through view modes
20. Document title is an inline-editable input, autosaves on blur
21. System theme auto-detected and applied; manual toggle overrides it
22. All existing tests pass (run `pnpm test`)

---

## Files Affected

```
apps/web/
├── index.html                          # D4 (fonts)
├── src/
│   ├── App.tsx                         # W1 (keyboard shortcuts)
│   ├── styles.css                      # D1–D5 (tokens), S8 (login gradient)
│   ├── styles/
│   │   ├── editor.css                  # D1–D3, E6 (resize handle)
│   │   ├── toolbar.css                 # D1–D3
│   │   ├── preview.css                 # D1–D3
│   │   ├── statusbar.css               # D1–D3
│   │   └── tabbar.css                  # D1–D3
│   ├── hooks/
│   │   ├── useTheme.tsx                # K1 (auto theme)
│   │   └── useFileUpload.ts            # E10 (upload markdown)
│   ├── components/
│   │   ├── CollaborativeEditor.tsx     # S3 (format), E1 (scroll-sync), E4 (vim), E9 (theme syntax)
│   │   ├── EditorToolbar.tsx           # E2 (outline), E3 (find/replace)
│   │   ├── MarkdownPreview.tsx         # E1 (scroll-sync)
│   │   ├── ShareDialog.tsx             # S2 (wire up), S7 (inline colors)
│   │   ├── ExcalidrawEditor.tsx        # S7 (inline colors), S9 (useEffect)
│   │   ├── UploadIndicator.tsx         # S7 (inline colors)
│   │   ├── StatusBar.tsx               # (minor: shortcut hint)
│   │   ├── ConfirmModal.tsx            # S5 (NEW — themed confirm dialog)
│   │   └── Toast.tsx                   # S5 (NEW — themed toast notifications)
│   └── pages/
│       ├── DocumentEditPage.tsx        # S1 (routes), S2 (share btn), S3 (format), S5 (alerts), E5 (Ctrl+S), E6 (resize), N6 (inline title), W2 (Ctrl+E)
│       ├── HomePage.tsx                # S4 (folder id)
│       ├── AdminUsersPage.tsx          # S5 (alerts → confirm)
│       └── GuestDocumentPage.tsx       # S7 (inline colors)

apps/backend/
└── prisma/schema.prisma               # E4 (editorKeymap field on User)

apps/backend/src/
├── services/user.service.ts           # E4 (keymap in update/read)
└── routes/users.ts                     # E4 (keymap in profile endpoint)
```

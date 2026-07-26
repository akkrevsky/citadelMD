# UI Improvement Recommendations for citadelMD

Date: 2026-07-26
Source: codebase audit (apps/web/) + competitive research (HackMD, HedgeDoc, Notion, Obsidian, Outline, StackEdit, Typora)

## Executive Summary

citadelMD has a solid editor core (CodeMirror 6 + Yjs real-time CRDT, split-view modes, manual commit/discard, dark/light themes) but the UI around it is unfinished. The dashboard is a placeholder, the sidebar tree is read-only, formatting toolbar works incorrectly, several critical UI components are orphaned or broken, and there is no design-token layer for consistency.

This document catalogues the current state, benchmarks against similar systems, and provides a prioritized catalogue of ~25 improvements grouped into implementation batches. Each batch is a coherent cycle; they are ordered by dependency (stabilize first, then build up).

---

## Part 1. Current State Assessment

Source: full audit of `apps/web/` (React + Vite + CodeMirror 6, ~1,230 lines of CSS across 6 files).

### 1.1 App Shell & Routing

| Item | Status | Notes |
|---|---|---|
| Routes | OK | `/login`, `/share/:token`, `/` (dashboard + nested: home, `/admin/users`, `/profile`, `/documents/:id/edit`) |
| Shell layout | Partial | Fixed 280px sidebar + `<Outlet>`, no top bar, no collapse |
| `navigate('/dashboard')` | **BROKEN** | `/dashboard` is not a registered route — `DocumentEditPage.tsx:56, 235, 244, 313`. Should be `/`. |
| Sidebar nav | OK | Dashboard, Admin Users (admin-only), Profile |
| Folder tree | Read-only | Rendered recursively, no collapse/expand, no selection, no actions |
| Global search | **Missing** | No search whatsoever |
| Command palette | **Missing** | No `Ctrl+K` / `Ctrl+P` equivalent |
| Breadcrumbs | **Missing** | Only a `document-path` text label below the title |

### 1.2 Dashboard (HomePage)

- Renders a single empty-state placeholder: "Select a document or create a new one to get started."
- Create-document form is an inline `<form>` with a title input.
- `createDocument` always passes `tree[0].id` as parent folder (`HomePage.tsx:19`) — multi-folder hierarchies collapse.
- No list/table/grid of existing documents — only the sidebar tree.
- No recent docs, no tags, no filtering, no sorting.

### 1.3 Editor

| Feature | Status | Notes |
|---|---|---|
| Split view (code/split/preview) | Works | Fixed 50/50 in split mode, no resize handle, no scroll-sync |
| Formatting toolbar | **BROKEN** | Bold/Italic/etc. insert literal strings (`**bold text**`) regardless of selection. Magic strings `__undo__`/`__redo__` over CustomEvent bus |
| TabBar | Decorative | Only ever holds the current doc — no multi-tab state |
| StatusBar | Basic | Words/chars/lines, read time, cursor position, connection dot. No line-numbers toggle, no language selector |
| Commit / Discard | Works | Commit requires a non-empty message; Discard uses native `confirm()` |
| Version history UI | **Missing** | Backend stores commits via Git, but no panel to browse, diff, or restore |
| Presence UI | **Missing** | yCollab gives remote cursors, but no avatar list, name labels, or "X is editing" |
| Find / Replace | **Missing** | `@codemirror/search` built in but not wired to toolbar |
| Outline / ToC | **Missing** | `@codemirror/language` exposes heading outline, not rendered |
| Scroll sync | **Missing** | Editor and preview scroll independently |
| Vim/Emacs keymaps | **Missing** | CodeMirror extensions exist, not exposed |
| Excalidraw | Works | Lazy-loaded modal, saves base64 SVG as code block |
| Upload | Partial | Paste/drag-drop/button; always generates `![name](url)` — PDFs/text files become broken image links |
| `ShareDialog.tsx` | **ORPHANED** | Component defined but never imported/rendered; no "Share" button exists |

### 1.4 Design System

| Aspect | Status | Notes |
|---|---|---|
| CSS custom properties | Partial | Colors + sidebar-width + header-height + one radius + one shadow. No spacing scale, no typography scale. |
| Theme palette | 2 themes | Dark (#0d1117 base) and Light (#f6f8fa base). GitHub-inspired. |
| System-auto theme | **Missing** | No `prefers-color-scheme` media query |
| Accent customization | **Missing** | Primary color hardcoded per theme |
| Font loading | **Broken** | JetBrains Mono referenced in font stack but never loaded (no `@font-face`, no Google Fonts link). Falls back silently. |
| Inline colors | **Rampant** | `ShareDialog.tsx`, `ExcalidrawEditor.tsx`, `UploadIndicator.tsx`, `GuestDocumentPage.tsx` use hardcoded hex values — look broken in dark theme. Login gradient is hardcoded. |
| Spacing/type scale | Ad-hoc | Literal px/rem values scattered; 7+ different font sizes without a scale |
| `styles.css` | 844 lines | Monolithic, no partials |
| `@media` queries | **Zero** | App is desktop-only |

### 1.5 Other Pages

| Page | Status |
|---|---|
| LoginPage | Centered card on hardcoded gradient. No "remember me", no SSO, no forgot-password |
| ProfilePage | Account info (read-only) + Change password. No display-name edit, no avatar, no git-name/email editor |
| AdminUsersPage | Table (login, display, role, active) + Create user form. No edit, no role-change, no pagination, no search |
| GuestDocumentPage | Read-only document view for share links. Uses hardcoded colors |

---

## Part 2. Competitive Research: What Similar Systems Do Well

Source: web research on HackMD / HedgeDoc, Notion, Obsidian, Outline, StackEdit, Typora (see [Sources](#sources)).

### 2.1 Editor Experience

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| Multi-view mode toggle (Edit/Split/View/Book/Slide) | HackMD, HedgeDoc | User picks cognitive context: write, read, present |
| Scroll-sync between editor and preview | StackEdit | Eliminates "where am I?" disorientation in split view |
| WYSIWYG-no-syntax mode (single pane) | Typora | Distraction-free writing while staying in Markdown |
| Outline / ToC pane from headings | HackMD (ToC button), StackEdit (`[TOC]` tag) | Fast long-doc navigation; click-to-jump |
| Find & replace | StackEdit, Obsidian | Basic editing affordance; CodeMirror ships built-in support |
| Vim/Emacs keymap toggle | HackMD, Obsidian | Power-user editing without leaving the app |
| Autosave indicator with timestamp | HackMD (10-min auto-version) | Safety net between manual saves; recover lost work |
| Slash commands (`/`) inserting blocks | Notion | Discoverability of formatting + future AI entry point |

### 2.2 Navigation & Workspace

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| Command palette / Quick switcher (`Ctrl+K` / `Ctrl+P`) | Notion, Obsidian | Jump to doc or action in one keystroke |
| Sidebar tree with drag-and-drop reorganization | Outline (collections) | Visual document hierarchy; move docs intuitively |
| Breadcrumbs showing folder hierarchy | Notion, Outline | Orientation in nested structure |
| Full-text search across all documents | Outline | Findability at scale |
| Recent documents list | Notion | Quick return to work |
| Inline-editable document title | Notion, Typora | Faster than modal rename; click and type |

### 2.3 Collaboration & Presence

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| Avatar stack of online users | Notion, Outline | At-a-glance "who's here" |
| Live cursors with name labels | HackMD, Outline | Attribution and coordination in real time |
| Inline comments / threads on selection | StackEdit, mdedit.ai | Discussion anchored to content |
| `@user` mentions and notifications | Notion | Collaborative coordination |

### 2.4 Versioning & Git UX

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| History timeline panel | Notion (page history), HackMD (line-level) | Browse past versions chronologically |
| Side-by-side or inline diff viewer | Notion, HackMD | See what changed between versions |
| One-click "Restore this version" | Notion | Easy rollback without CLI |
| Auto-snapshot every N minutes | HackMD (10-min) | Safety net between manual commits |
| Commit-message field with context | Notion | Captures why, not just what |

### 2.5 Visual Design & Customization

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| System-auto theme (dark/light) | Obsidian, Notion | Respects OS preference; no manual toggle needed |
| Accent color picker | Obsidian, Notion | Personalization without custom CSS |
| Font family + size controls | HackMD, Obsidian | Comfort and accessibility |
| Custom CSS injection | Obsidian (community themes) | Deep personalization for power users |
| Density toggle (compact/comfortable) | Notion | Screen real-estate preference |
| Document cover image + emoji icon | Notion | Visual identity in doc lists; fast recognition |

### 2.6 AI Integration (relevant — citadelMD has an MCP server)

| Pattern | Who does it well | Problem it solves |
|---|---|---|
| Inline AI suggestions with diff-review accept/reject | Nimbalyst, mdedit.ai | AI edits are visible, reversible, trusted |
| Side-panel chat agent | Notion AI, Outline AI | AI as collaborator, not replacement |
| Slash commands to invoke AI (`/summarize`, `/rewrite`) | Notion AI | Contextual AI actions without leaving the editor |
| BYO-API-key for self-hosted AI | mdedit.ai | Data sovereignty; fits citadelMD's self-hosted model |

---

## Part 3. Comprehensive Improvement Catalogue

Each item assessed for: Impact (low/medium/high), Effort (low/medium/high). Order within each theme is roughly by priority.

### 3.1 Stabilization & Bug Fixes (Foundation)

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| S1 | Fix `navigate('/dashboard')` → `/` (4 call sites) | High | Low | Restores "Back to Dashboard" and tab-close navigation |
| S2 | Wire up ShareDialog — add "Share" button to editor toolbar/doc header | High | Low | Unlocks existing but dead sharing feature |
| S3 | Make formatting toolbar operate on selection (wrap, not insert literals) | High | Low | Bold/Italic/etc. become actually useful |
| S4 | Fix create-document to use target folder, not `tree[0].id` | High | Low | Multi-folder hierarchies work correctly |
| S5 | Replace native `alert()`/`confirm()` with themed toast/confirm modals | Med | Low | Consistent visual experience; no jarring OS dialogs |
| S6 | Load JetBrains Mono (or fallback) properly via `@font-face` or `<link>` | Low | Low | Editor monospace renders as intended |
| S7 | Fix inline colors in ShareDialog, ExcalidrawEditor, UploadIndicator, GuestDocumentPage — use CSS custom properties | Med | Low | Dark theme works everywhere |
| S8 | Make login gradient respect theme, or make it a CSS custom property | Low | Low | Visual consistency on login page |
| S9 | Fix `useState(() => { import(...) })` in ExcalidrawEditor to `useEffect` | Low | Low | No double-fire under StrictMode |

### 3.2 Design System Foundation

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| D1 | Define spacing scale: `--space-{xs,sm,md,lg,xl,2xl}` | High | Low | Consistent spacing everywhere; replace ad-hoc px/rem |
| D2 | Define typography scale: `--text-{xs,sm,base,lg,xl,2xl,3xl}` | High | Low | Consistent font sizes; one place to tweak |
| D3 | Define radius scale: `--radius-{sm,md,lg,full}` | Med | Low | Consistent rounding; stop hardcoding `3px`/`4px`/`6px` |
| D4 | Consolidate component styles from `styles.css` (844 lines) into co-located CSS modules or per-component files | Med | Med | Maintainable styling; easier to reason about |
| D5 | Add `--color-primary-{light,dark}` and make all components reference them | High | Low | Single-point control of primary color across themes |

### 3.3 Editor Experience

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| E1 | Scroll-sync between editor and preview panes | High | Low | Eliminates split-view disorientation; small CM scroll-event glue |
| E2 | Outline / ToC pane from document headings (click-to-jump) | High | Low | `@codemirror/language` already exposes heading outline; fast long-doc nav |
| E3 | Find & Replace — wire `@codemirror/search` to toolbar button + `Ctrl+H` | Med | Low | Built-in CM extension; just needs UI wiring |
| E4 | Vim / Emacs keymap toggle (user profile setting, persisted) | Med | Low | `@replit/codemirror-vim` exists; power-user affordance |
| E5 | `Ctrl+S` app-level shortcut → commit (save) | Med | Low | Users expect this; prevents losing work |
| E6 | Resizable split-view handle (drag to adjust editor/preview ratio) | Med | Low | Users want more or less preview real estate |
| E7 | Slash command menu (`/` in editor shows block-type / action dropdown) | High | Med | Discoverability for formatting + future AI entry point |
| E8 | Typewriter mode (keep current line centered vertically) | Low | Low | Distraction-free writing; CM has `scrollPastEnd` / `EditorView.scrollIntoView` |
| E9 | Markdown syntax highlighting palette respects theme (currently hardcoded GitHub-dark hexes) | Med | Low | Light-theme CM highlighting looks wrong today |
| E10 | Fix upload to generate correct markdown: `[name](url)` for non-images instead of broken `![name](url)` | Low | Low | PDFs and text files become clickable links instead of broken images |

### 3.4 Workflow & Keyboard Shortcuts

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| W1 | Define app-level keyboard shortcut map: `Ctrl+S` (save/commit), `Ctrl+Shift+F` (search), `Ctrl+K` (command palette), `F11` (fullscreen editor) | High | Low | Brings app up to user expectations; ~20 lines of `useEffect` keydown listener |
| W2 | View-mode cycling via shortcut (`Ctrl+E` — Edit → Split → Preview → Edit) | Med | Low | Matches Obsidian muscle memory |

### 3.5 Workspace & Navigation

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| N1 | Command palette / Quick switcher (`Ctrl+K`) — jump to document or action | High | Med | High daily-use payoff; single entry point for navigation + actions |
| N2 | Full-text search across all documents | High | Med | Postgres ILIKE or tsvector; gates findability at scale |
| N3 | Breadcrumbs above editor showing folder hierarchy | Med | Low | Folder hierarchy is in DB; trivial render, big orientation payoff |
| N4 | Make sidebar tree actionable: rename, delete, create folder via context menu | High | Med | Tree is read-only today; this is the table-stakes filesystem UX |
| N5 | Recent documents list in sidebar or command palette | Med | Low | Backend has doc metadata; one query, quick return-to-work |
| N6 | Inline-editable document title (click title in editor, type, auto-save metadata) | Low | Low | Notion-style; removes need for a rename modal |
| N7 | Document emoji icon + cover image (DB columns + picker in editor header) | Low | Low | Visual identity in doc lists |

### 3.6 Collaboration & Presence

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| C1 | Online-user avatar stack + presence list (Yjs awareness → avatars by doc title) | Med | Low | Yjs awareness already tracks this; render avatars from user initials/gravatar |
| C2 | Connection quality indicator per user (latency dot color) | Low | Low | Builds trust in real-time sync |
| C3 | Inline comments / threads on selection ranges | High | High | Anchoring to Yjs ranges + comment data model is substantial; two-phase |

### 3.7 Versioning & Git UX

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| V1 | History timeline panel — list of commits for current document | High | Med | `simple-git` already has `log()`; UI panel + API endpoint |
| V2 | Side-by-side diff viewer between two commits | High | Med | `simple-git` has `diff()`; render in a modal or bottom panel |
| V3 | One-click "Restore this version" button | High | Med | Routes to existing discard/restore logic already in `document.service.ts` |
| V4 | Auto-snapshot safety net between manual commits (every 10 min) | Med | Med | Periodic flush+stash; restorable as "draft recovery"; distinct from real Git commits |
| V5 | Commit-message autocomplete from recent messages (`git log --format=%s` datalist) | Low | Low | Reduces repetitive typing |

### 3.8 Customization

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| K1 | System-auto theme (respect `prefers-color-scheme`) | High | Low | Users with OS dark mode auto-get dark; no manual toggle needed |
| K2 | Accent color picker (primary color override) | Med | Low | CSS custom property swap; profile field; immediate visual personalization |
| K3 | Font family + size controls (editor + preview independently) | Med | Low | Profile settings → CSS variables; accessibility + comfort |
| K4 | Custom CSS injection (user-level or instance-level) | Low | Low | Obsidian-style deep customization for power users |
| K5 | Density toggle (compact / comfortable / spacious) | Med | Low | `--space-*` scale shift; screen real-estate preference |

### 3.9 AI Integration

| # | Improvement | Impact | Effort | Rationale |
|---|---|---|---|---|
| A1 | AI side panel — chat/agent UI wired to citadelMD's MCP server | High | Med | MCP server already exists; surface its tools in-browser as a collapsible panel |
| A2 | Slash `/ai` command in editor → prompt box → insert or replace with AI response | High | Med | Contextual AI without context-switching |
| A3 | Inline AI suggestion with diff-review accept/reject (Nimbalyst/mdedit.ai pattern) | High | High | Streaming + diff overlay on Y.Doc; highest-trust AI UX but more complex |
| A4 | `/summarize`, `/rewrite` as preset slash commands | Med | Low | Parameterized prompts on top of A2 |

---

## Part 4. Implementation Batches

Improvements grouped into coherent, deliverable batches. Each batch is a single cycle (one spec → one plan → one implementation pass). Ordered by dependency: later batches assume earlier ones are done.

### Batch A: Stabilization + Design Foundation + Quick Wins

Duration: ~1 cycle. Fixes everything that is broken, establishes the design-token base, adds the highest-ratio editor features.

Items: S1–S9, D1–D5, E1–E6, E9–E10, W1–W2, N6, K1

**Deliverable:** A consistent, stable app where the toolbar works correctly, dead routes are fixed, ShareDialog is usable, the visual theme is consistent everywhere, spacing/typography use a defined scale, and the editor has scroll-sync, outline, find/replace, vim mode, and resizable split panels.

### Batch B: Workspace & Navigation

Duration: ~1 cycle. Turns the app from an editor-with-empty-dashboard into a functional multi-document workspace.

Items: N1–N5, N7

**Deliverable:** Command palette (Ctrl+K), full-text search, breadcrumbs, actionable sidebar tree (rename/delete/create folder via context menu), recent docs, emoji icons on docs. Users can find, navigate, and organize documents efficiently.

### Batch C: Collaboration & Version History

Duration: ~1 cycle. Surfaces the Yjs + Git foundations that already exist into user-facing features.

Items: C1–C3, V1–V5

**Deliverable:** Avatar presence list, connection quality, version-history timeline panel with side-by-side diff and one-click restore, auto-snapshot safety net, commit-message autocomplete.

### Batch D: Customization

Duration: ~1 cycle. User-facing theming and personalization.

Items: K2–K5

**Deliverable:** Accent color picker, font/size controls, custom CSS injection, density toggle. Per-user settings persisted to DB.

### Batch E: AI Integration

Duration: ~1 cycle (largest). Wires the existing MCP server into the browser UI.

Items: A1–A4

**Deliverable:** AI side panel chatting with the MCP server, slash `/ai` commands in the editor, `/summarize` and `/rewrite` presets, inline diff-review for AI suggestions.

---

## Part 5. Recommended Implementation Order

```
Batch A (Foundation) → Batch B (Workspace) → Batch C (Collab/History) → Batch D (Customization) → Batch E (AI)
```

Rationale:
- **A first** because building features on broken UI (dead routes, selection-broken toolbar, theme-inconsistent components) multiplies rework. Design tokens (D1–D5) make subsequent batches cleaner.
- **B second** because workspace navigation is the daily driver — without it, the app feels empty even with a polished editor.
- **C third** because Yjs + Git are already implemented; this batch just surfaces them in UI. Presence makes collaboration visible; version history makes Git meaningful without CLI.
- **D fourth** because customization is "nice to have" relative to functionality; K1 (system-auto theme) is already in Batch A.
- **E last** because the MCP server is a unique differentiator worth polishing into a real feature, but it needs the UI framework from earlier batches (command palette for slash commands, side panel pattern from history, consistent design tokens).

---

## Sources

### Codebase
- Full audit of `apps/web/` — routing, pages, components, styles, hooks (see §1 throughout)

### Competitive Research (Web)
- [HedgeDoc Features](https://hedgedoc.cit.tum.de/s/features)
- [HackMD Tutorial — Features](https://hackmd.io/@pyk/tutorials-features)
- [HackMD — Note Versions (auto-save, revert)](https://hackmd.io/@docs/save-version-en)
- [HackMD — Show Editing History (line-level diff)](https://hackmd.io/@docs/show_editing_history_en)
- [Using Slash Commands — Notion](https://www.notion.com/help/guides/using-slash-commands)
- [Keyboard Shortcuts — Notion](https://www.notion.com/help/keyboard-shortcuts)
- [Page icons & covers — Notion](https://www.notion.com/help/guides/page-icons-and-covers)
- [Delete & restore content / Version history — Notion](https://www.notion.com/help/duplicate-delete-and-restore-content)
- [Command palette — Obsidian Help](https://obsidian.md/help/plugins/command-palette)
- [Obsidian Keyboard Shortcuts](https://www.dsebastien.net/obsidian-keyboard-shortcuts/)
- [Outline — Team Knowledge Base](https://www.getoutline.com/)
- [Outline Documents Guide](https://docs.getoutline.com/s/guide/doc/documents-UiH1h0aQFQ)
- [Outline — GitHub repo (React + Node.js)](https://github.com/outline/outline)
- [Outline — Document permissions](https://www.getoutline.com/changelog/document-permissions)
- [Outline — Shared document search](https://www.getoutline.com/changelog/shared-document-search)
- [Outline — Drag-and-drop (Fit and finish)](https://www.getoutline.com/changelog/fit-and-finish)
- [Typora — official site](https://typora.io/)
- [StackEdit — official site](https://stackedit.io/)
- [StackEdit review — SuperMonitoring](https://www.supermonitoring.com/blog/write-markdown-hassle-freely-stackedit/)
- [Collaborative Markdown Editor: Key Features & AI Tools (2026)](https://markdownconverters.com/blog/collaborative-markdown-editor)
- [Best Markdown Editor — Nimbalyst (inline AI diff review)](https://nimbalyst.com/blog/the-complete-guide-to-markdown-editors/)
- [mdedit.ai — AI-powered collaborative markdown](https://mdedit.ai/)
- [StackEdit vs HedgeDoc vs HackMD vs Unmarkdown](https://unmarkdown.com/blog/stackedit-vs-hedgedec-vs-hackmd)

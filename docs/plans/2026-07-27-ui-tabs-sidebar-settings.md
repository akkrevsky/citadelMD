# 2026-07-27 — UI: скрываемый sidebar, дата создания, настройки, вкладки

4 фичи фронтенда (+ минимальный бэкенд для даты создания).

## Решения дизайна

- **F1 Sidebar**: сворачивается кнопкой-гамбургером в шапке sidebar; состояние в `localStorage` (`citadelmd-sidebar-collapsed`); плавный CSS `transition` на `width`/`transform`.
- **F2 Дата создания**: формат `MM.DD HH-MM` (напр. `07.23 17-30`) из `createdAt`, показывается под названием документа в дереве. Бэкенд отдаёт `createdAt` в `/api/tree`.
- **F3 Настройки**: объединить с Профилем → страница «Профиль и настройки» с секциями: **Аккаунт / Внешний вид / Git-идентичность**.
- **F4 Вкладки**: модель VS Code (Preview/Pin). Один клик по документу = предпросмотр (временная вкладка, курсив). Двойной клик = закрепить как постоянную вкладку. Состояние поднимается в `TabsContext` поверх роута `/documents/:id/edit`.

---

## F2 — Дата создания в дереве (бэкенд + фронтенд)

### Задачи
1. `apps/backend/src/services/folder.service.ts`: в маппинге документов дерева (2 места: основное дерево ~L412 и org-tree ~L482) добавить `createdAt` в select и в результирующий объект.
2. `apps/web/src/api-client.ts`: добавить `createdAt: string` в `Document` и `FolderNode.documents`.
3. `apps/web/src/pages/DashboardPage.tsx`: под именем документа рендерить `<span className="doc-created-at">{format(doc.createdAt)}</span>`.
4. Утилита `formatCreatedAt(iso)` → `MM.DD HH-MM` (локальное время). Положить в `apps/web/src/utils/format.ts`.
5. CSS: `.doc-created-at` (приглушённый цвет, мелкий шрифт) в `styles.css`.

### Тесты
- `utils/format.test.ts`: `formatCreatedAt('2026-07-23T17:30:00Z')` → корректный паттерн (фиксируем tz через mock или сравниваем по структуре).

---

## F1 — Скрываемый sidebar

### Задачи
1. `apps/web/src/pages/DashboardPage.tsx`: `const [collapsed, setCollapsed] = useState(() => localStorage.getItem('citadelmd-sidebar-collapsed') === '1')`. Класс `collapsed` на `.dashboard-layout`.
2. Кнопка-гамбургер в `.sidebar-header` → `toggleSidebar()`. Сохранять в localStorage.
3. CSS: `.dashboard-layout.collapsed .sidebar { width: 0 / transform }`, `transition: width .2s`. Когда свёрнут — основная область занимает всю ширину; гамбургер остаётся доступным (плавающая кнопка или в main-header).

### Тесты
- Компонентный тест на переключение класса не обязателен (CSS-фича); проверяем руками.

---

## F3 — Профиль и настройки

### Задачи
1. `apps/web/src/api-client.ts`: добавить `updateProfile({ gitName?, gitEmail? })` → `PATCH /api/auth/me` (если эндпоинта нет — добавить на бэкенд).
2. Бэкенд `apps/backend/src/routes/auth.ts`: `PATCH /api/auth/me` — обновление `gitName`/`gitEmail` для текущего пользователя.
3. `apps/web/src/pages/ProfilePage.tsx`: переименовать заголовок в «Профиль и настройки», добавить секции:
   - **Внешний вид**: выбор темы (тёмная/светлая/системная) через `useTheme()`.
   - **Git-идентичность**: поля `gitName`, `gitEmail` + кнопка «Сохранить».
4. CSS: секции-карточки уже есть (`.card`); добавить стили для radio-группы темы.

### Тесты
- `api-client.test.ts`: `updateProfile` шлёт PATCH с gitName/gitEmail.
- Бэкенд: тест `PATCH /api/auth/me` обновляет git-поля (мок auth).

---

## F4 — Вкладки (Preview/Pin)

### Задачи
1. `apps/web/src/contexts/TabsContext.tsx` (новый): состояние
   - `pinnedTabs: Tab[]` (постоянные),
   - `previewTab: Tab | null` (временный, один),
   - `activeTabId: string`,
   - `openPreview(tab)` — установить/заменить preview, сделать активным,
   - `pinTab(id)` — переместить preview в pinned,
   - `closeTab(id)` — убрать из pinned (и из active, переключиться на соседа),
   - `setActive(id)`.
   Persist `pinnedTabs` (только id+title) в localStorage.
2. Обернуть `DashboardPage` в `<TabsProvider>`.
3. `apps/web/src/pages/DashboardPage.tsx` дерево документов: `onClick` → `openPreview`+navigate, `onDoubleClick` → `pinTab`+navigate.
4. `apps/web/src/components/TabBar.tsx`: рендерить `[...pinnedTabs, previewTab?]`, preview-вкладка с классом `preview` (курсив). Активная — `active`. Закрытие только у pinned.
5. `apps/web/src/pages/DocumentEditPage.tsx`: убрать локальный single-tab `TabBar`, читать активную вкладку из контекста; при загрузке документа регистрировать его в контексте (если открыт напрямую по URL — добавить в preview/pinned).
6. Поднять `TabBar` на уровень `DashboardPage`/layout, чтобы был виден над `Outlet`.

### Тесты
- `TabsContext` unit-тесты: openPreview заменяет preview, pinTab переносит в pinned, closeTab убирает и выбирает соседа, persist в localStorage.

---

## Порядок реализации

1. F2 (дата) — бэкенд + фронтенд, маленький, изолированный.
2. F1 (sidebar) — CSS + DashboardPage.
3. F3 (настройки) — бэкенд PATCH + ProfilePage.
4. F4 (вкладки) — самый большой, контекст + TabBar + DocumentEditPage + sidebar.

Feature branch: `feat/ui-tabs-sidebar-settings`. Коммит на каждую фичу. TDD где есть изолируемая логика (format, TabsContext, api-client).

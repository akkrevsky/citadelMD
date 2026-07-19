# 01 — Требования

> Итог сократического допроса (grillme) + обновления.
> v3 от 2026-07-19: убраны Obsidian/SSH, добавлена модель ручного commit + discard.

---

## 🎯 Цель

Спроектировать ТЗ на разработку **самописной веб-системы совместного редактирования Markdown-документов** с real-time CRDT-коллаборацией, **версионностью через Git** (diff'ы, восстановление версий, ручной commit).

Система реализуется кодовыми агентами (Codex / Claude Code / OpenCode) по этому ТЗ.

## 📋 Контекст использования

- Команда ~10 человек
- Разворачивается на собственном VPS
- Редактирование **только в web-интерфейсе** (Obsidian и локальные файлы — **не нужны**)
- Версионность: diff'ы, история, ручные контрольные точки

## ✅ Функциональные требования

### Документы и редактирование
- Pure Markdown (валидный `.md` синтаксис)
- Real-time совместное редактирование на уровне курсора (CRDT, посимвольный мердж)
- Auto-save каждые 5 секунд — правки не теряются при сбое
- **Ручной commit** — пользователь сам решает, когда создать версию (не каждый чих)
- **Discard** — откат незакоммиченных правок к последнему коммиту

### Версионность (через Git)
- Просмотр истории коммитов (`git log`)
- Diff между любыми версиями (как в git: добавлено/удалено)
- Diff незакоммиченных изменений (`git diff HEAD`)
- Восстановление любой версии (`git checkout <sha> -- <file>` + новый commit)
- Author каждого коммита = пользователь системы

### Права доступа
- Роли: ADMIN / EDITOR / VIEWER
- ADMIN: всё + управление пользователями и папками
- EDITOR: создание/правка документов в доступных папках
- VIEWER: только чтение в доступных папках
- Иерархия папок с наследованием прав

### Публичный доступ
- Share-ссылки с TTL и правами read/write
- Гость видит курсоры и правки в real-time
- Гость не видит дерево папок — только один документ

### Markdown расширения
- Подсветка кода (Prism)
- Mermaid диаграммы
- KaTeX математика (`$...$`, `$$...$$`)
- Таблицы (GFM)
- Task lists (`- [ ]`, `- [x]`)
- Callouts (`> [!warning]` как Obsidian)
- Footnotes
- Embeds (YouTube/Vimeo)

### Attachments
- Drag-n-drop и paste-image в редактор
- MIME allowlist: image/*, application/pdf, text/plain
- Лимит файла: 25 MB
- Хранилище: MinIO (S3), 200 ГБ
- Квоты: 5 ГБ на пользователя, 50 ГБ на пространство

## 🎛 Нефункциональные требования

- **Self-hosted**, Docker Compose, 4–6 сервисов
- **Стек:** React + CodeMirror 6 + markdown-it (frontend), Node.js + TypeScript + Fastify (backend), Yjs (real-time), PostgreSQL + Prisma (метаданные), MinIO (attachments), Redis (cache/locks)
- **Auth:** JWT в httpOnly cookie, логин+пароль, bcrypt
- **Хранение контента:** Git working repo на FS (не в БД)
- HTTPS-only (Nginx + Let's Encrypt)
- **Backup:** ежедневный PG dump + периодический push Git-репо в mirror
- Русский язык интерфейса (опционально)
- Логирование (stdout контейнеров), health check endpoint

## 📝 Режим сохранения (критическое решение)

| Слой | Что хранит | Когда обновляется |
|---|---|---|
| **Yjs (RAM)** | Текущее состояние документа | Непрерывно, при каждой правке |
| **Working tree (файл на FS)** | Auto-saved контент | Каждые 5 сек из Yjs |
| **Git HEAD** | Последняя зафиксированная версия | Только по кнопке Commit |

**Три операции пользователя:**
1. **Commit** (`POST /api/documents/:id/commit`) — создаёт новую версию в истории
2. **Discard** (`POST /api/documents/:id/discard`) — откатывает незакоммиченные правки к HEAD
3. **Restore** (`POST /api/documents/:id/revisions/:sha/restore`) — восстанавливает старую версию

## ❌ Не входит в MVP

- Полнотекстовый поиск
- Теги / метаданные документов
- Wiki-links `[[...]]` и backlinks
- Экспорт в PDF/HTML (только raw md)
- Webhooks / notifications
- OAuth / SSO
- Obsidian / локальное редактирование файлов
- 2FA

## ⚠️ Риски

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Yjs CRDT merge edge-cases | Средняя | Среднее | Использовать готовый y-redis, TDD на сценариях коллаборации |
| Git operation failures (одновременный commit от двух юзеров) | Низкая | Среднее | Redis distributed lock на файл перед commit |
| MinIO недоступен | Низкая | Низкое | Health check, retry, fallback на local FS |
| XSS через markdown | Средняя | Высокое | `html: false` в markdown-it + DOMPurify |
| Производительность `git log` на большой истории | Низкая | Низкое | Pagination, опционально кэш в Redis |
| Потеря auto-saved правок при падении FS | Очень низкая | Высокое | Periodic background commit всех dirty-файлов (раз в час) |

## 🔮 Возможные расширения (после MVP)

- Полнотекстовый поиск (pg_trgm или OpenSearch)
- Теги и категории
- Wiki-links с backlinks
- PDF/HTML экспорт
- Email notifications
- 2FA

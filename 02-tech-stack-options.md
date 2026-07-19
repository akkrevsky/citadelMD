# 02 — Технологический стек (опции выбора)

> Статус: **РЕШЕНО** (2026-07-19). Выбран вариант 1: React + CodeMirror 6 + markdown-it. Документ сохранён как референс выбора.

## ✅ Зафиксировано

| Компонент | Решение |
|---|---|
| **Backend runtime** | Node.js + TypeScript |
| **HTTP framework** | Fastify |
| **ORM** | Prisma |
| **БД** | PostgreSQL |
| **CRDT engine** | Yjs (серверная часть) |
| **CRDT persistence** | y-redis или Y-Sweet (TBD — на этапе архитектуры) |
| **Cache / pub-sub** | Redis |
| **Object storage** | MinIO (S3-совместимое, 200 ГБ) |
| **Auth** | bcrypt + JWT (cookie httpOnly), без external IdP |
| **Reverse proxy** | Nginx |
| **Контейнеризация** | Docker Compose |

## 🔄 Под выбор — фронтенд

### Таблица 1 — Фреймворк

| Критерий | **React** | **Vue 3** | **Svelte** |
|---|---|---|---|
| Экосистема MD-редакторов | ★★★★★ | ★★★★ | ★★★ |
| Готовых Yjs-биндингов | ★★★★★ | ★★★★ | ★★★ |
| Готовых компонентов (tree, preview, Mermaid, KaTeX) | ★★★★★ | ★★★★ | ★★★ |
| Кривая обучения для поддержки | средняя | низкая | низкая |
| Производительность real-time | средняя | высокая | высокая |
| AI-агенты (Codex/Claude) — качество кода | ★★★★★ | ★★★★ | ★★★ |
| Сообщество / Stack Overflow | огромная | большая | средняя |
| **Примеры в проде** | Outline, Notion-подобные | AFFiNE (через React-слой) | Standard Notes |

**Рекомендация:** React — максимальная зрелость экосистемы и лучшее качество кода от AI-агентов.

### Таблица 2 — Ядро MD-редактора

> Критично для pure-md + Yjs. Это то, что определяет «Obsidian-like» ощущения.

| Критерий | **CodeMirror 6** | **Monaco** | **Tiptap (ProseMirror)** |
|---|---|---|---|
| Чистый markdown (текст = .md) | ★★★★★ | ★★★★★ | ★★ (блочный) |
| Yjs-интеграция (CRDT-коллаб) | ★★★★★ (`y-codemirror.next`, официальная) | ★★★★ (`y-monaco`) | ★★★★★ (`y-prosemirror`, лучший) |
| Размер бандла | ~150 KB | ~5 MB (тяжёлый, VSCode) | ~300 KB |
| MD-расширения (Mermaid, KaTeX, подсветка) | ★★★★★ | ★★★ | ★★★★ |
| Layout «Obsidian-like» (text editor + preview) | **идеально** | идеально | плохо (WYSIWYG) |
| Real-time курсоры в тексте | ★★★★★ | ★★★★ | ★★★★★ |
| Рекомендация AI-агентов в коде | отлично | средне | хорошо |

**Рекомендация:** **CodeMirror 6 + `y-codemirror.next`** — чистый текстовый md-редактор с полноценной CRDT-коллаборацией. Именно это даёт «Obsidian-like» ощущения.

> ⚠️ Tiptap отпадает по требованию pure-md — он WYSIWYG/блочный, текст не портируем.

### Таблица 3 — Превью-рендерер

| Критерий | **markdown-it** | **remark/rehype** | **unified** |
|---|---|---|---|
| Поддержка расширений (Mermaid, KaTeX, callouts) | ★★★★★ | ★★★★★ | ★★★★ |
| Гибкость (плагины) | ★★★★ | ★★★★★ | ★★★★★ |
| Используется в | HedgeDoc, VuePress, docsify | Gatsby, Astro, MDX | Nest |

**Рекомендация:** **markdown-it + плагины** — самый простой путь, его используют HedgeDoc, docsify, Obsidian Publish.

---

## 🎯 Рекомендуемый стек (полный)

```
Frontend:  React + Vite + CodeMirror 6 + y-codemirror.next + markdown-it
Backend:   Node.js + TypeScript + Fastify + Prisma + JWT
Real-time: Yjs WebSocket gateway + y-redis (persistence в Postgres)
Storage:   MinIO/S3 (attachments, 200 ГБ)
Cache:     Redis
DB:        PostgreSQL
Infra:     Docker Compose (app, postgres, redis, minio, yjs-server, nginx)
```

## 📋 Варианты выбора (для подтверждения)

| Вариант | Стек | Плюс | Минус |
|---|---|---|---|
| **1. React + CodeMirror 6** ⭐ | React + CM6 + y-codemirror.next | Максимум зрелости, лучшие AI-агенты, идеальный Obsidian-feel | Средняя производительность real-time |
| **2. Vue 3 + CodeMirror 6** | Vue 3 + CM6 + y-codemirror.next | Проще поддержка, быстрее real-time | Меньше готовых компонентов |
| **3. React + Monaco** | React + Monaco + y-monaco | «VSCode feeling», мощный editor | ~5 MB бандл, тяжелее dep-граф |

## ❓ Решение, которое нужно принять

Выбрать одну из трёх комбинаций выше (или предложить свою). После выбора — фиксируем стек и переходим к разработке ТЗ по архитектуре (`03-architecture.md` и далее).

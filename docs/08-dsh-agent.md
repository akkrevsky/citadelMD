# AI-агент (deepseek-harness)

Агентный помощник на главной странице на базе [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). Заменяет простой чат: агент может читать, создавать и править заметки через MCP-инструменты citadelMD, а также выполнять произвольные задачи в собственной изолированной песочнице.

## Архитектура

```
браузер
  ├─ http://<host>:8081  → nginx (web-контейнер): SPA + /api + /socket + /mcp
  └─ http://<host>:8082  → nginx (web-контейнер): auth_request → backend /api/auth/me
                              └─ при 200: весь origin → dsh:3080
                                                      (SPA агента + его /api + WebSocket)

dsh (отдельный контейнер, без host-портов):
  └─ deepseek-ai API (native chat-completions, ключ DEEPSEEK_API_KEY)
  └─ MCP-клиент → http://mcp-server:3100/mcp (Bearer $DSH_MCP_TOKEN)
                  → инструменты mcp__citadelmd__* (10 шт.)
```

Ключевые решения:

- **Отдельный origin (порт 8082), а не под-path.** SPA dsh жёстко зашивает root-absolute `/api` для своего RPC — на одном origin с citadelMD он конфликтовал бы с бэкендом.
- **Авторизация** — только `auth_request` в nginx (у dsh своей авторизации нет). Порт 3080 наружу никогда не публикуется.
- **Изоляция** — git-репозиторий документов в контейнер dsh не монтируется; содержимое citadelMD доступно агенту только через MCP.
- **Идентичность** — агент действует как сервисный пользователь `harness` (ADMIN) с ApiKey.
- **Локальный доступ.** Порт 8082 публикуется только локально; удалённый nginx его не проксирует. Для удалённого доступа (следующий шаг): поддомен с `COOKIE_DOMAIN` в бэкенде или https-порт 8443 на удалённом nginx.

## Конфигурация профиля

Профиль `web` авто-инициализируется при первом старте; поверх него применяется home-level патч `$DSH_HOME/cordis.patch.yml`, сидируемый entrypoint'ом из [infra/dsh/profile/](../infra/dsh/profile/) в volume `dsh_data`:

- `agent-default-model` → провайдер `deepseek-official`, модель из env `DSH_MODEL` (по умолчанию `deepseek-v4-pro`; каталог: `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp`);
- `llm-deepseek` → `apiKeyEnv: DEEPSEEK_API_KEY` (fallback base: `$DEEPSEEK_BASE_URL` → публичный API);
- `webserver` → `0.0.0.0:3080`;
- `insert` `@deepseek-ai/dsh-mcp-client` → `http://mcp-server:3100/mcp`, заголовок `Authorization: Bearer $DSH_MCP_TOKEN`, инструменты `mcp__citadelmd__*`.

Персона и правила агента — `$DSH_HOME/AGENTS.md` (сидится из `infra/dsh/profile/AGENTS.md`): русский язык, «Викинг», работа с заметками только через MCP, без выдуманных id, подтверждение необратимых действий.

## Provisioning и ротация ключа

```bash
make -C infra agent-key   # создаёт пользователя harness (ADMIN) или ротирует его apiKey
                          # и пишет его в infra/.env как DSH_MCP_TOKEN
```

Скрипт идемпотентен: ключ ротируется при каждом запуске. После ротации пересоздать контейнер (`make -C infra redeploy`).

## Переменные окружения (infra/.env)

| Переменная | Назначение |
|---|---|
| `DEEPSEEK_API_KEY` | sk-ключ платформы DeepSeek для native API (обычно тот же, что `ANTHROPIC_AUTH_TOKEN`) |
| `DEEPSEEK_BASE_URL` | переопределение базы эндпоинта LLM (пусто = публичный API) |
| `DSH_MODEL` | id модели native-каталога (`deepseek-v4-pro`) |
| `DSH_MCP_TOKEN` | apiKey пользователя `harness` (генерируется `make agent-key`) |

## Безопасность

- Ключ `DSH_MCP_TOKEN` даёт полный API-доступ от имени ADMIN-пользователя: он живёт только в gitignored `infra/.env` и в env контейнера dsh, в логи не попадает.
- Порт 3080 (сам dsh) не публикуется; единственные ворота — nginx 8082 с `auth_request`.
- Инструменты терминала/файлов dsh заперты в контейнере dsh.

## Известные риски

- dsh — developer preview, совместимость ломается между версиями. Версии зафиксированы в `infra/dsh/Dockerfile` (`--save-exact`); обновления — осознанно, по одной версии.
- Версионный перекос `dsh-mcp-client@0.0.1-rc.1` vs ядро `0.1.1-rc.2`: проверяется по логам при первом старте (MCP-клиент подключён).
- Модель `deepseek-v4-pro[1m]` из Anthropic-совместимого эндпоинта — это НЕ id native-каталога; native id задаётся через `DSH_MODEL`.

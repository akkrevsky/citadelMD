# Environment Configuration для citadelMD

## 📋 Файлы конфигурации

### `.env` (активный)
Текущий рабочий файл с переменными окружения для Docker Compose.

### `.env.production` (рекомендуемый)  
Упрощенная версия со всеми необходимыми параметрами и комментариями для быстрого старта.

### `.env.complete` (полная версия)
Расширенная версия со всеми возможными параметрами, документацией и дополнительными настройками.

### `.env.example` (шаблон)
Базовый шаблон от разработчиков с placeholder'ами.

## 🚀 Быстрый старт

### 1. Настройка переменных окружения:
```bash
cd /home/sp/workspace/citadelMD/infra
cp .env.production .env
# или отредактируйте .env вручную
```

### 2. Запуск через скрипт:
```bash
./start.sh
```

### 3. Запуск вручную:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

## 🌐 Доступ к Web интерфейсу

После запуска сервисов:

- **🌍 Web Frontend:** http://localhost:8080
- **🔌 API Backend:** http://localhost:3000/api  
- **📦 MinIO Console:** http://localhost:9001

### Credentials:
- **Login:** admin
- **Password:** admin123

## 🔧 Основные переменные

| Переменная | Значение | Описание |
|------------|----------|----------|
| POSTGRES_PASSWORD | test123 | Пароль PostgreSQL |
| ADMIN_PASSWORD | admin123 | Пароль admin пользователя |
| JWT_SECRET | super-secret-jwt... | Ключ для JWT токенов |
| MINIO_ROOT_PASSWORD | test123456 | Пароль MinIO |
| PUBLIC_BASE_URL | http://localhost | Базовый URL приложения |

## 🧪 Проверка работы

```bash
# Статус сервисов
docker compose -f docker-compose.yml ps

# Тест API
curl http://localhost:3000/api/health

# Авторизация
curl -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' \
  http://localhost:3000/api/auth/login

# Логи backend
docker compose -f docker-compose.yml logs backend
```

## 📊 Готовые функции

- ✅ **Phase 0:** Инфраструктура Docker
- ✅ **Phase 1:** Авторизация, пользователи, папки
- ✅ **Phase 2:** Документы с Git версионностью  
- 🔄 **Phase 3:** Real-time редактирование (следующий этап)

## 🔄 Следующие шаги

1. Протестируйте web интерфейс на http://localhost:8080
2. Создайте несколько документов через UI
3. Проверьте Git историю и версионность
4. Готовьтесь к Phase 3 - real-time collaborative editing
#!/bin/bash
# Quick Start Script для citadelMD
# Запускает все сервисы и выводит информацию для доступа

cd "$(dirname "$0")"

echo "🚀 Запуск citadelMD..."
echo "=================================="

# Проверяем наличие .env файла
if [ ! -f ".env" ]; then
    echo "⚠️  .env файл не найден, копирую из .env.production..."
    cp .env.production .env
fi

echo "📦 Запускаем Docker сервисы..."
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

echo ""
echo "⏳ Ожидаем запуск сервисов (30 сек)..."
sleep 30

echo ""
echo "🔍 Проверяем статус сервисов..."
docker compose -f docker-compose.yml ps

echo ""
echo "🌐 Web интерфейс готов!"
echo "=================================="
echo "🌍 Frontend:      http://localhost:8080"
echo "🔌 API Backend:   http://localhost:3000/api"
echo "📦 MinIO Console: http://localhost:9001"
echo ""
echo "🔑 Credentials для входа:"
echo "Login:    admin"
echo "Password: admin123"
echo ""
echo "🧪 Тест API:"
echo "curl http://localhost:3000/api/health"
echo ""
echo "📋 Проверить логи backend:"
echo "docker compose -f docker-compose.yml logs backend"
echo ""
echo "🛑 Остановить сервисы:"
echo "docker compose -f docker-compose.yml down"
echo "=================================="

# Тест API
echo "🧪 Тестируем API..."
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ API работает!"
else
    echo "❌ API не отвечает, проверьте логи backend"
fi

echo ""
echo "🎉 citadelMD запущен и готов к использованию!"
echo "Откройте http://localhost:8080 в браузере"
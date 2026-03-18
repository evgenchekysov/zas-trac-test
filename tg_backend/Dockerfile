FROM python:3.11-slim

# Базовые настройки Python
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Система и рабочая папка
WORKDIR /app

# Установим системные зависимости (по минимуму; расширим при необходимости)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Зависимости Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Копируем исходники
COPY . /app

# Railway прокинет сюда порт, а мы слушаем 0.0.0.0
ENV PORT=9000

# Предполагаем, что в tg_notify.py определён FastAPI-приложение как `app`
# Если модуль/имя приложения иные — поправим строку ниже.
CMD ["sh", "-c", "uvicorn tg_notify:app --host 0.0.0.0 --port ${PORT}"]

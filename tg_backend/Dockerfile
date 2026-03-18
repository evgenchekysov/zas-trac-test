FROM python:3.11-slim

# Базовые настройки Python
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Система и рабочая папка
WORKDIR /app

# Зависимости (если есть requirements.txt)
COPY requirements.txt /app/requirements.txt
RUN if [ -f /app/requirements.txt ]; then \
      pip install --no-cache-dir -r /app/requirements.txt ; \
    fi

# Копируем исходники
COPY . /app

# Railway передает порт в переменной PORT
ENV PORT=9000

# Запуск FastAPI
# Предполагается, что в tg_notify.py определен объект app (FastAPI)
CMD ["sh", "-c", "uvicorn tg_notify:app --host 0.0.0.0 --port ${PORT}"]

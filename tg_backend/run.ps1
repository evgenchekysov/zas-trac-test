# Заполни окружение (значения — свои)
$env:BOT_TOKEN = "123456789:ABCDEF_your_bot_token"
$env:CHAT_ID   = "-1001234567890"
$env:API_KEY   = "supersecret"   # можно удалить если не нужен ключ

# Активация локального venv, если используешь (иначе — системный Python)
# .\..\.venv\Scripts\Activate.ps1

uvicorn tg_backend/tg_notify:app --host 0.0.0.0 --port 9000 --reload

#!/usr/bin/env bash
export BOT_TOKEN="123456789:ABCDEF_your_bot_token"
export CHAT_ID="-1001234567890"
export API_KEY="supersecret"   # опционально

# source ../.venv/bin/activate  # если используешь venv
uvicorn tg_backend.tg_notify:app --host 0.0.0.0 --port 9000 --reload
``

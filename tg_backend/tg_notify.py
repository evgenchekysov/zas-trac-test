# tg_backend/tg_notify.py

import os
import html
import requests
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --------- Окружение / настройки ---------
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
CHAT_ID = os.getenv("CHAT_ID", "")
API_KEY = os.getenv("API_KEY", "")  # опционально
# Можно задать множественные origin через запятую
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "https://evgenchekysov.github.io").split(",") if o.strip()
]

if not BOT_TOKEN or not CHAT_ID:
    print("[WARN] BOT_TOKEN/CHAT_ID не заданы. Задай их в окружении перед запуском.")

TG_URL = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

# --------- Модели ---------
class Ticket(BaseModel):
    id: int
    title: str
    status: str
    priority: Optional[str] = None
    requester: Optional[str] = None
    assignees: List[str] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    closedAt: Optional[str] = None
    dueAt: Optional[str] = None
    month: Optional[str] = None
    location: Optional[str] = None

class Payload(BaseModel):
    event: str
    ticket: Ticket
    extra: Dict[str, Any] = Field(default_factory=dict)
    sentAt: str

# --------- Приложение / CORS ---------
app = FastAPI(title="ZAS‑TRAC Telegram notifier")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["Content-Type", "x-api-key"],
)

# --------- Утилиты ---------
def esc(s: Optional[str]) -> str:
    return html.escape(s or "")

def norm_event(ev: str) -> str:
    """Приводим имена к нижнему регистру и заменяем точки на подчёркивания,
    чтобы одинаково принимать 'ticket.created' и 'ticket_created'."""
    return (ev or "").strip().lower().replace(".", "_")

def format_ticket_line(t: Ticket) -> str:
    parts = [f"<b>#{t.id}</b> — {esc(t.title)}"]
    if t.priority:
        parts.append(f"(приоритет: <b>{esc(t.priority)}</b>)")
    return " ".join(parts)

def send_tg(text: str) -> Dict[str, Any]:
    if not BOT_TOKEN or not CHAT_ID:
        print("[TG] DRY‑RUN:", text)
        return {"ok": False, "reason": "missing_token_or_chat", "dry_run": True}

    data = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(TG_URL, json=data, timeout=10)
        try:
            body = resp.json()
        except Exception:
            body = {"text": resp.text}
        print(f"[TG] RESP STATUS: {resp.status_code} BODY: {body}")
        return body if isinstance(body, dict) else {"ok": False, "raw": body}
    except Exception as e:
        print("[TG] Exception:", e)
        return {"ok": False, "exception": str(e)}

def render_message(p: Payload) -> str:
    t = p.ticket
    ev = norm_event(p.event)
    x  = p.extra or {}

    base = format_ticket_line(t)
    loc = f"\n📍 Место: {esc(t.location)}" if t.location else ""
    req = f"\n👤 Заявитель: {esc(t.requester)}" if t.requester else ""
    ded = f"\n⏰ Дедлайн: {esc(t.dueAt)}" if t.dueAt else ""
    mon = f"\n🗓️ Месяц: {esc(t.month)}" if t.month else ""

    if ev == "ticket_created":
        return f"🆕 <b>Новая заявка</b>\n{base}{req}{loc}{mon}"
    if ev == "ticket_overdue_new":
        return f"⛔️ <b>Просрочена новая заявка</b>\n{base}{ded}{loc}{req}{mon}"
    if ev == "ticket_assigned":
        assignees = ", ".join([esc(a) for a in (t.assignees or x.get("assignees") or [])]) or "не указаны"
        return f"👥 <b>Назначена заявка</b>\n{base}\nИсполнители: {assignees}{loc}{req}{mon}"
    if ev == "ticket_started":
        actor = esc(x.get("actor") or "исполнитель")
        return f"▶️ <b>Взята в работу</b>\n{base}\nИсполнитель: {actor}{loc}{req}{mon}"
    if ev == "ticket_paused":
        actor = esc(x.get("actor") or "исполнитель")
        return f"⏸️ <b>Пауза</b>\n{base}\nИнициатор: {actor}{loc}{req}{mon}"
    if ev == "ticket_resumed":
        actor = esc(x.get("actor") or "исполнитель")
        return f"⏯️ <b>Возобновлена</b>\n{base}\nИнициатор: {actor}{loc}{req}{mon}"
    if ev == "ticket_closed":
        actor = esc(x.get("actor") or "исполнитель")
        suffix = f"\n✅ Закрыта: {esc(t.closedAt)}" if t.closedAt else ""
        return f"✅ <b>Закрыта</b>\n{base}{suffix}{loc}{req}{mon}"
    if ev == "ticket_moved_next_month":
        from_m = esc(x.get("fromMonth") or "")
        to_m   = esc(x.get("toMonth") or "")
        return f"🔁 <b>Перенос на следующий месяц</b>\n{base}\nБыло: {from_m} → Стало: {to_m}"

    # дефолт
    return f"ℹ️ <b>{esc(p.event)}</b>\n{base}{loc}{req}{mon}"

# --------- Роуты ---------
@app.get("/tg/ping")
def tg_ping() -> Dict[str, Any]:
    return {"ok": True, "env": "railway", "origins": ALLOWED_ORIGINS}

@app.options("/tg/notify")
def tg_notify_options() -> Response:
    # CORS middleware сам поставит нужные заголовки
    return Response(status_code=200)

@app.post("/tg/notify")
async def tg_notify(
    payload: Payload,
    request: Request,
    x_api_key: Optional[str] = Header(default=None),
):
    origin = request.headers.get("origin")

    # Разрешаем: (а) корректный ключ ИЛИ (б) доверенный Origin.
    if API_KEY:
        authorized = (x_api_key is not None and x_api_key == API_KEY) or (origin in ALLOWED_ORIGINS)
    else:
        authorized = (origin in ALLOWED_ORIGINS)

    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    text = render_message(payload)
    print("[TG] SEND payload:", payload.dict())
    tg_resp = send_tg(text)

    if not tg_resp.get("ok"):
        # Прокидываем телеграм‑ошибку наверх, чтобы видеть причину в HTTP‑логах.
        raise HTTPException(status_code=502, detail=tg_resp)

    return {"ok": True, "telegram": tg_resp}

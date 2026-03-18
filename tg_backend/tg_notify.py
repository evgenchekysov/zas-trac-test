# tg_notify.py
import os
import html
import requests
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
CHAT_ID   = os.getenv("CHAT_ID", "")
API_KEY   = os.getenv("API_KEY", "")  # опционально (для простейшей защиты)

if not BOT_TOKEN or not CHAT_ID:
    print("[WARN] BOT_TOKEN/CHAT_ID не заданы. Задай их в окружении перед запуском.")

TG_URL = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

class Ticket(BaseModel):
    id: int
    title: str
    status: str
    priority: Optional[str] = None
    requester: Optional[str] = None
    assignees: Optional[List[str]] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    closedAt: Optional[str] = None
    dueAt: Optional[str] = None
    month: Optional[str] = None
    location: Optional[str] = None

class Payload(BaseModel):
    event: str
    ticket: Ticket
    extra: Optional[Dict[str, Any]] = {}
    sentAt: str

app = FastAPI(title="ZAS-TRAC Telegram notifier")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # в проде можно сузить до домена фронта
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def esc(s: Optional[str]) -> str:
    return html.escape(s or "")

def format_ticket_line(t: Ticket) -> str:
    parts = [f"<b>#{t.id}</b> — {esc(t.title)}"]
    if t.priority:
        parts.append(f"(приоритет: <b>{esc(t.priority)}</b>)")
    return " ".join(parts)

def send_tg(text: str) -> None:
    if not BOT_TOKEN or not CHAT_ID:
        print("[TG] (dry-run) ", text)
        return
    data = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(TG_URL, data=data, timeout=10)
        if not resp.ok:
            print("[TG] Error:", resp.status_code, resp.text)
    except Exception as e:
        print("[TG] Exception:", e)

def render_message(p: Payload) -> str:
    t = p.ticket
    ev = p.event
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
        assignees = ", ".join([esc(a) for a in (t.assignees or x.get('assignees') or [])]) or "не указаны"
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
        closedAt = esc(t.closedAt or "")
        suffix = f"\n✅ Закрыта: {closedAt}" if closedAt else ""
        return f"✅ <b>Закрыта</b>\n{base}{suffix}{loc}{req}{mon}"
    if ev == "ticket_moved_next_month":
        from_m = esc(x.get("fromMonth") or "")
        to_m   = esc(x.get("toMonth") or "")
        return f"🔁 <b>Перенос на следующий месяц</b>\n{base}\nБыло: {from_m} → Стало: {to_m}"
    return f"ℹ️ <b>{esc(ev)}</b>\n{base}{loc}{req}{mon}"

@app.post("/tg/notify")
def tg_notify(payload: Payload, x_api_key: Optional[str] = Header(default=None)):
    # Простейшая защита: общий ключ (опционально)
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    text = render_message(payload)
    send_tg(text)
    return {"ok": True}

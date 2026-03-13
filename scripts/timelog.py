import os
import json
from datetime import datetime

TRACES_DIR = "traces"

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def safe_load(path):
    """Чтение JSON с защитой от пустых/битых файлов"""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def write_trace(issue_id, title, room, equipment_id, event_type, author, reason=None):
    ensure_dir(TRACES_DIR)

    path = os.path.join(TRACES_DIR, f"issue-{issue_id}.json")

    data = safe_load(path)

    # Создаём структуру если файла нет или он битый
    if data is None:
        data = {
            "issue_id": issue_id,
            "title": title,
            "room": room,
            "equipment_id": equipment_id,
            "events": []
        }

    # Подготовка события
    event = {
        "ts": datetime.utcnow().isoformat(),
        "type": event_type,
        "author": author,
        "equipment_id": equipment_id,
        "title": title
    }

    if reason:
        event["reason"] = reason

    # Добавляем событие
    data["events"].append(event)

    # Перезаписываем файл
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[timelog] Updated {path}")


if __name__ == "__main__":
    """
    Пример запуска:
    python timelog.py 123 "Title" "Room-12" "EQ-550" start evgenij "optional reason"
    """

    import sys

    if len(sys.argv) < 7:
        print("Usage: python timelog.py <issue_id> <title> <room> <equipment_id> <event_type> <author> [reason]")
        exit(1)

    issue_id = sys.argv[1]
    title = sys.argv[2]
    room = sys.argv[3]
    equipment_id = sys.argv[4]
    event_type = sys.argv[5]
    author = sys.argv[6]
    reason = sys.argv[7] if len(sys.argv) > 7 else None

    write_trace(issue_id, title, room, equipment_id, event_type, author, reason)

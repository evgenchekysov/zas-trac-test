import os
import json
from datetime import datetime, timedelta
import sys

TRACES_DIR = "traces"
CACHE_DIR = "cache"
ISSUES_DIR = "issues"


def parse_ts(ts):
    return datetime.fromisoformat(ts)


def safe_load(path):
    """Чтение JSON без падения на пустых/битых файлах"""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_issue(issue_id):
    """Основная заявка из /issues/issue-NNN.json"""
    path = os.path.join(ISSUES_DIR, f"issue-{issue_id}.json")
    return safe_load(path)


def calc_work_and_hold(events):
    work_minutes = 0
    hold_minutes = 0

    last_ts = None
    last_state = None

    for ev in events:
        ts = parse_ts(ev["ts"])
        event_type = ev["type"]

        if last_ts is not None:
            delta = (ts - last_ts).total_seconds() / 60

            if last_state == "start":
                work_minutes += delta
            elif last_state == "resume":
                work_minutes += delta
            elif last_state == "hold":
                hold_minutes += delta

        last_ts = ts
        last_state = event_type

    return int(work_minutes), int(hold_minutes)


def build_month_cache(year, month):
    results = {
        "year": year,
        "month": month,
        "issues": []
    }

    ensure_dir(CACHE_DIR)

    # Перебираем все трассы
    for fname in os.listdir(TRACES_DIR):
        if not fname.startswith("issue-") or not fname.endswith(".json"):
            continue

        path = os.path.join(TRACES_DIR, fname)
        trace = safe_load(path)

        if trace is None:
            print(f"[WARN] Cannot read {path}")
            continue

        issue_id = trace.get("issue_id")
        issue = load_issue(issue_id) or {}

        # Подтягиваем данные
        title = trace.get("title") or issue.get("title")
        room = trace.get("room") or issue.get("room")
        equipment_id = trace.get("equipment_id") or issue.get("equipment_id")
        assignee = issue.get("assignee")

        events = trace.get("events", [])

        work_minutes, hold_minutes = calc_work_and_hold(events)

        results["issues"].append({
            "issue_id": issue_id,
            "title": title,
            "room": room,
            "equipment_id": equipment_id,
            "assignee": assignee,
            "work_minutes": work_minutes,
            "hold_minutes": hold_minutes,
            "events": events
        })

    out_path = os.path.join(CACHE_DIR, f"month-{year}-{month}.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"[OK] Cache created: {out_path}")


def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python build_month_cache.py <year> <month>")
        exit(1)

    year = sys.argv[1]
    month = sys.argv[2]

    build_month_cache(year, month)

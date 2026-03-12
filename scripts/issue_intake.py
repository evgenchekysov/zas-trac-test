from pathlib import Path
import os, re, json, sys

EQUIP = Path("data/equipment.json")

RE_ROOM    = r"(?:Room|Помещение)\s*[:\-]\s*(.+)"
RE_QR      = r"(?:QR[-\s]*ID|Inventory\s*note)\s*[:\-]\s*(.+)"
RE_INV     = r"(?:Inventory\s*Number|Инвентарный\s*номер)\s*[:\-]\s*(.+)"

def norm(s):
    return str(s).strip() if s is not None else None

def parse_issue_payload():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path or not os.path.exists(event_path):
        print("::error::No GITHUB_EVENT_PATH")
        sys.exit(1)
    event = json.load(open(event_path, "r", encoding="utf-8"))
    issue = event.get("issue") or {}
    title = issue.get("title") or ""
    body  = issue.get("body") or ""

    parsed = {"title": title, "body": body}
    for key, pat in {"room": RE_ROOM, "qr_id": RE_QR, "inventory_number": RE_INV}.items():
        m = re.search(pat, body, re.IGNORECASE)
        if m:
            parsed[key] = norm(m.group(1))
    return parsed

def same(a, b):
    if not a or not b:
        return False
    return norm(a).lower() == norm(b).lower()

def load_equipment():
    if not EQUIP.exists():
        print("::warning::data/equipment.json not found; skip detection")
        return []
    try:
        return json.load(open(EQUIP, "r", encoding="utf-8"))
    except Exception as e:
        print(f"::warning::cannot read equipment.json: {e}")
        return []

def find_equipment(equipment, qr_id=None, inv=None, descr=None):
    # 1) QR-ID точное
    if qr_id:
        for e in equipment:
            if same(e.get("qr_id"), qr_id):
                return e
    # 2) Inventory Number точное
    if inv:
        for e in equipment:
            if same(e.get("inventory_number"), inv):
                return e
    # 3) Поиск по части описания (из title в первую очередь)
    if descr:
        needle = descr.lower()
        for e in equipment:
            d = e.get("description") or ""
            if d and needle in d.lower():
                return e
    return None

def set_outputs(**kwargs):
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if not gh_out:
        return
    with open(gh_out, "a", encoding="utf-8") as f:
        for k, v in kwargs.items():
            if v is None:
                continue
            f.write(f"{k}={v}\n")

def main():
    parsed = parse_issue_payload()
    equipment = load_equipment()

    provided_room = parsed.get("room")
    qr  = parsed.get("qr_id")
    inv = parsed.get("inventory_number")
    descr = parsed.get("title") or parsed.get("body")

    found = find_equipment(equipment, qr_id=qr, inv=inv, descr=descr)

    room = None
    equipment_id = None
    detected = False

    if provided_room:
        room = norm(provided_room)
    elif found and found.get("room"):
        room = norm(found["room"])
        detected = True

    if found:
        equipment_id = found.get("qr_id") or found.get("inventory_number")
        detected = True

    # outputs для следующих шагов workflow
    set_outputs(
        room=room or "",
        equipment_id=equipment_id or "",
        detected="true" if detected else "false"
    )

    print(f"Detected room={room}, equipment_id={equipment_id}, detected={detected}")

if __name__ == "__main__":
    main()

#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-evgenchekysov/zas-trac-test}"  # ← при необходимости замени

LABELS_JSON='
[
  {"name":"status:new","color":"4b9cd3","description":"Новая"},
  {"name":"status:assigned","color":"1f6feb","description":"Назначена"},
  {"name":"status:in_progress","color":"0e8a16","description":"В работе"},
  {"name":"status:on_hold","color":"bf8700","description":"Пауза"},
  {"name":"status:done","color":"6f42c1","description":"Завершена"},
  {"name":"status:reopened","color":"d93f0b","description":"Переоткрыта"},
  {"name":"status:cancelled","color":"6a737d","description":"Отменена"},

  {"name":"prio:низкий","color":"c2e0c6","description":"Приоритет: низкий"},
  {"name":"prio:средний","color":"bfdadc","description":"Приоритет: средний"},
  {"name":"prio:высокий","color":"f9d0c4","description":"Приоритет: высокий"},
  {"name":"prio:аварийный","color":"e11d21","description":"Приоритет: аварийный"},

  {"name":"type:request","color":"ededed","description":"Заявка"},

  {"name":"hold:waiting_parts","color":"fbca04","description":"Ожидание запчастей"},
  {"name":"hold:customer","color":"fbca04","description":"Ожидание клиента"},
  {"name":"hold:window","color":"fbca04","description":"Ожидание окна"},
  {"name":"hold:planning","color":"fbca04","description":"Планирование"},
  {"name":"hold:vendor","color":"fbca04","description":"Ожидание внешнего подрядчика"}
]
'

echo "$LABELS_JSON" | jq -c '.[]' | while read -r label; do
  name=$(echo "$label" | jq -r '.name')
  color=$(echo "$label" | jq -r '.color')
  desc=$(echo "$label" | jq -r '.description')

  if gh label list -R "$REPO" --limit 1000 | awk -F '\t' '{print $1}' | grep -Fxq "$name"; then
    gh label edit "$name" -R "$REPO" --color "$color" --description "$desc"
  else
    gh label create "$name" -R "$REPO" --color "$color" --description "$desc"
  fi
done

echo "Labels: OK"

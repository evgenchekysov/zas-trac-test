let year = new Date().getFullYear();
let month = new Date().getMonth() + 1;

function loadCache() {
  const path = `../cache/month-${year}-${String(month).padStart(2, "0")}.json`;

  document.getElementById("month-title").innerText =
    `${year}-${String(month).padStart(2, "0")}`;

  fetch(path)
    .then(r => r.json())
    .then(data => renderBoard(data.issues))
    .catch(() => {
      document.querySelectorAll(".list").forEach(el => el.innerHTML = "");
    });
}

function renderBoard(issues) {
  // очистка
  ["new", "assigned", "in_progress", "on_hold", "done"].forEach(col => {
    document.getElementById(`col-${col}`).innerHTML = "";
  });

  issues.forEach(issue => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-id">#${issue.issue_id}</div>
      <div class="card-title">${issue.title || "(без названия)"}</div>
      <div class="card-room">📍 ${issue.room || "-"}</div>
      <div class="card-assignee">👤 ${issue.assignee || "-"}</div>
      <div class="card-metrics">
        ⏱ ${issue.work_minutes}м • ⏸ ${issue.hold_minutes}м
      </div>
    `;

    const status = getStatus(issue);
    const col = document.getElementById(`col-${status}`);
    col.appendChild(card);
  });
}

function getStatus(issue) {
  const events = issue.events || [];
  if (!events.length) return "new";

  const last = events[events.length - 1].type;
  switch (last) {
    case "start":
    case "resume": return "in_progress";
    case "hold": return "on_hold";
    case "done": return "done";
    default: return "assigned";
  }
}

document.getElementById("prev").onclick = () => {
  month--;
  if (month === 0) { month = 12; year--; }
  loadCache();
};
document.getElementById("next").onclick = () => {
  month++;
  if (month === 13) { month = 1; year++; }
  loadCache();
};

loadCache();

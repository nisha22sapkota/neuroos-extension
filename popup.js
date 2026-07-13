const toggle = document.getElementById("toggle");
const list = document.getElementById("list");

chrome.storage.local.get({ interventionsEnabled: true, sessions: [] }, (v) => {
  toggle.checked = v.interventionsEnabled;
  renderSessions(v.sessions);
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ interventionsEnabled: toggle.checked });
});

function renderSessions(sessions) {
  if (!sessions.length) {
    list.innerHTML = `<div class="empty">No sessions logged yet. Use ChatGPT or Claude for a bit — NeuroOS checks in when a session runs long or gets effortful.</div>`;
    return;
  }
  const rows = sessions
    .slice()
    .reverse()
    .slice(0, 15)
    .map((s) => {
      const when = new Date(s.ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const mins = Math.round(s.durationMs / 60000);
      return `
        <div class="row">
          <div>
            <span class="dot ${s.level}"></span>${s.host.replace("www.", "")}
            <div class="when">${when} · ${mins}m</div>
          </div>
          <div class="stat">sends ${s.sends} · rw ${s.rewrites}</div>
          <div class="stat">${s.effort ? "effort " + s.effort + "/5" : ""}</div>
        </div>`;
    })
    .join("");
  list.innerHTML = rows;
}

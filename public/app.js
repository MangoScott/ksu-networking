const MAX_SELECTIONS = 3;

const grid = document.getElementById("board-grid");
const countEl = document.getElementById("selection-count");
const chips = document.getElementById("selected-chips");
const hidden = document.getElementById("hidden-selections");
const form = document.getElementById("request-form");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const successBox = document.getElementById("success");
const successText = document.getElementById("success-text");
const template = document.getElementById("member-card");

let members = [];
const selected = new Map(); // id -> member

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "form__status" + (kind ? ` is-${kind}` : "");
}

function renderSelection() {
  countEl.textContent = `${selected.size} of ${MAX_SELECTIONS} selected`;

  chips.innerHTML = "";
  hidden.innerHTML = "";
  if (selected.size === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "None selected yet. Pick up to three from the list above.";
    chips.appendChild(li);
  }
  for (const m of selected.values()) {
    const li = document.createElement("li");
    li.textContent = m.name + " ";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Remove ${m.name}`);
    btn.textContent = "×";
    btn.addEventListener("click", () => toggle(m.id, false));
    li.appendChild(btn);
    chips.appendChild(li);

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "boardMembers";
    input.value = m.id;
    hidden.appendChild(input);
  }

  const full = selected.size >= MAX_SELECTIONS;
  grid.querySelectorAll(".member__check").forEach((cb) => {
    cb.checked = selected.has(cb.value);
    cb.disabled = full && !cb.checked;
  });
}

function toggle(id, on) {
  const m = members.find((x) => x.id === id);
  if (!m) return;
  if (on) {
    if (selected.size >= MAX_SELECTIONS) return;
    selected.set(id, m);
  } else {
    selected.delete(id);
  }
  renderSelection();
}

function renderBoard() {
  grid.innerHTML = "";
  for (const m of members) {
    const node = template.content.firstElementChild.cloneNode(true);
    const cb = node.querySelector(".member__check");
    cb.value = m.id;
    cb.setAttribute("aria-label", `Select ${m.name}`);
    cb.addEventListener("change", () => toggle(m.id, cb.checked));
    node.querySelector(".member__avatar").textContent = initials(m.name);
    node.querySelector(".member__name").textContent = m.name;
    node.querySelector(".member__title").textContent = m.title;
    node.querySelector(".member__company").textContent = m.company;
    const focus = node.querySelector(".member__focus");
    for (const f of m.focus || []) {
      const s = document.createElement("span");
      s.textContent = f;
      focus.appendChild(s);
    }
    node.querySelector(".member__bio").textContent = m.bio || "";
    grid.appendChild(node);
  }
  renderSelection();
}

async function loadBoard() {
  try {
    const res = await fetch("/api/board-members");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    members = await res.json();
    renderBoard();
  } catch (err) {
    grid.innerHTML = `<p class="muted">Couldn't load the board right now. Please refresh the page.</p>`;
    console.error(err);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const email = form.elements.email.value.trim();
  if (!form.elements.name.value.trim()) return setStatus("Please enter your name.", "error");
  if (!/^[^\s@]+@kent\.edu$/i.test(email)) return setStatus("Please use your @kent.edu email address.", "error");
  const file = form.elements.resume.files[0];
  if (!file) return setStatus("Please attach your resume.", "error");
  if (file.size > 5 * 1024 * 1024) return setStatus("Resume must be 5 MB or smaller.", "error");
  if (selected.size === 0) return setStatus("Select at least one board member above.", "error");

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";
  try {
    const res = await fetch("/api/submissions", { method: "POST", body: new FormData(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");

    const names = data.boardMembers || [];
    const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0] || "";
    successText.textContent = `We've received your resume and will share it with ${list}. Thanks for reaching out!`;
    form.hidden = true;
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send my request";
  }
});

loadBoard();

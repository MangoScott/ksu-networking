const fmt = window.fmt;
const el = fmt.el;

const grid = document.getElementById("board-grid");
const dayFilter = document.getElementById("day-filter");
const picked = document.getElementById("picked");
const slotIdInput = document.getElementById("slot-id");
const form = document.getElementById("request-form");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const successBox = document.getElementById("success");
const successText = document.getElementById("success-text");

let members = [];
let slots = [];
let event = {};
let activeDay = "all";
let selectedSlot = null;

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "form__status" + (kind ? ` is-${kind}` : "");
}

function applyEvent(ev) {
  event = ev;
  document.getElementById("brand-event").textContent = ev.name || "Super Week";
  document.getElementById("hero-dates").textContent = [ev.name, ev.dates].filter(Boolean).join(" · ");
  if (ev.tagline) document.getElementById("hero-tagline").textContent = ev.tagline + " Pick an open time, attach your resume, and you're booked.";
  if (ev.format) document.getElementById("step-format").textContent = ev.format + " Come with questions.";
  document.getElementById("tz-label").textContent = ev.timezoneLabel || "local time";
  document.title = `${ev.name || "Super Week"} · Kent State Department of Finance`;
}

function renderStats() {
  const open = slots.filter((s) => !s.booked);
  document.getElementById("stat-open").textContent = open.length;
  document.getElementById("stat-members").textContent = new Set(slots.map((s) => s.memberId)).size;
}

function renderDayFilter() {
  const days = [...new Set(slots.map((s) => s.date))].sort();
  dayFilter.innerHTML = "";
  if (days.length < 2) return;
  const mk = (value, label) =>
    el("button", {
      type: "button",
      class: "day-chip" + (activeDay === value ? " is-active" : ""),
      role: "tab",
      "aria-selected": activeDay === value ? "true" : "false",
      text: label,
      onclick: () => { activeDay = value; renderDayFilter(); renderBoard(); },
    });
  dayFilter.append(mk("all", "All days"));
  for (const d of days) dayFilter.append(mk(d, fmt.date(d)));
}

function slotButton(member, slot) {
  const label = fmt.time(slot.time);
  const isSelected = selectedSlot && selectedSlot.id === slot.id;
  return el("button", {
    type: "button",
    class: "slot" + (slot.booked ? " is-taken" : "") + (isSelected ? " is-selected" : ""),
    disabled: slot.booked,
    "aria-pressed": isSelected ? "true" : "false",
    "aria-label": slot.booked ? `${label} on ${fmt.date(slot.date)} with ${member.name}, already taken` : `Pick ${label} on ${fmt.date(slot.date)} with ${member.name}`,
    text: slot.booked ? `${label} · taken` : label,
    onclick: () => pick(member, slot),
  });
}

function renderBoard() {
  grid.innerHTML = "";
  const visible = slots.filter((s) => activeDay === "all" || s.date === activeDay);
  let shown = 0;

  for (const m of members) {
    const mine = visible.filter((s) => s.memberId === m.id);
    if (mine.length === 0) continue;
    shown++;

    const byDate = new Map();
    for (const s of mine) (byDate.get(s.date) || byDate.set(s.date, []).get(s.date)).push(s);

    const openCount = mine.filter((s) => !s.booked).length;
    const card = el("article", { class: "member" }, [
      el("div", { class: "member__head" }, [
        el("span", { class: "member__avatar", "aria-hidden": "true", text: fmt.initials(m.name) }),
        el("div", { class: "member__who" }, [
          el("span", { class: "member__name", text: m.name }),
          el("span", { class: "member__title", text: [m.title, m.company].filter(Boolean).join(" · ") }),
        ]),
        m.linkedin
          ? el("a", { class: "linkedin", href: m.linkedin, target: "_blank", rel: "noopener", "aria-label": `${m.name} on LinkedIn`, title: "View on LinkedIn", text: "in" })
          : null,
      ]),
      el("div", { class: "member__focus" }, (m.focus || []).map((f) => el("span", { text: f }))),
      m.bio ? el("p", { class: "member__bio", text: m.bio }) : null,
      el("p", { class: "member__count " + (openCount ? "" : "muted"), text: openCount ? `${openCount} open time${openCount === 1 ? "" : "s"}` : "Fully booked" }),
      ...[...byDate.entries()].map(([date, list]) =>
        el("div", { class: "slot-day" }, [
          el("span", { class: "slot-day__label", text: fmt.date(date) }),
          el("div", { class: "slot-list" }, list.map((s) => slotButton(m, s))),
        ])
      ),
    ]);
    grid.append(card);
  }

  if (shown === 0) {
    grid.append(el("p", { class: "muted", text: slots.length ? "No times on that day. Try another day." : "No times have been posted yet. Check back soon!" }));
  }
}

function pick(member, slot) {
  selectedSlot = { ...slot, member };
  slotIdInput.value = slot.id;
  renderBoard();
  renderPicked();
  setStatus("");
  document.getElementById("signup").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => form.elements.name.focus({ preventScroll: true }), 500);
}

function renderPicked() {
  picked.innerHTML = "";
  if (!selectedSlot) {
    picked.append(el("p", { class: "muted picked__empty" }, ["No time picked yet. ", el("a", { href: "#times", text: "Choose one above" }), "."]));
    return;
  }
  const s = selectedSlot;
  picked.append(
    el("div", { class: "picked__card" }, [
      el("span", { class: "member__avatar", "aria-hidden": "true", text: fmt.initials(s.member.name) }),
      el("div", {}, [
        el("strong", { text: s.member.name }),
        el("span", { text: `${fmt.longDate(s.date)} · ${fmt.time(s.time)} ${event.timezoneLabel || ""} · ${s.durationMinutes} min` }),
      ]),
      el("a", { href: "#times", class: "picked__change", text: "Change" }),
    ])
  );
}

async function load() {
  try {
    const [ev, m, s] = await Promise.all([
      fetch("/api/event").then((r) => r.json()),
      fetch("/api/board-members").then((r) => r.json()),
      fetch("/api/slots").then((r) => r.json()),
    ]);
    applyEvent(ev);
    members = m;
    slots = s;
    renderStats();
    renderDayFilter();
    renderBoard();
    renderPicked();
  } catch (err) {
    grid.innerHTML = `<p class="muted">Couldn't load open times right now. Please refresh the page.</p>`;
    console.error(err);
  }
}

async function refreshSlots() {
  slots = await fetch("/api/slots").then((r) => r.json());
  renderStats();
  renderDayFilter();
  renderBoard();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  if (!selectedSlot) return setStatus("Pick a time above first.", "error");
  if (!form.elements.name.value.trim()) return setStatus("Please enter your name.", "error");
  if (!/^[^\s@]+@kent\.edu$/i.test(form.elements.email.value.trim())) return setStatus("Please use your @kent.edu email address.", "error");
  const file = form.elements.resume.files[0];
  if (!file) return setStatus("Please attach your resume.", "error");
  if (file.size > 5 * 1024 * 1024) return setStatus("Resume must be 5 MB or smaller.", "error");
  const li = form.elements.linkedin.value.trim();
  if (li && !/linkedin\.com\/in\//i.test(li)) return setStatus("LinkedIn should look like linkedin.com/in/your-name.", "error");

  submitBtn.disabled = true;
  submitBtn.textContent = "Booking…";
  try {
    const res = await fetch("/api/bookings", { method: "POST", body: new FormData(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 || res.status === 404) {
        selectedSlot = null;
        slotIdInput.value = "";
        renderPicked();
        await refreshSlots();
      }
      throw new Error(data.error || "Something went wrong. Please try again.");
    }
    successText.textContent = `You're meeting ${data.member} on ${fmt.longDate(data.date)} at ${fmt.time(data.time)} ${event.timezoneLabel || ""} for ${data.durationMinutes} minutes.`;
    form.hidden = true;
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
    await refreshSlots();
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Book my time";
  }
});

load();

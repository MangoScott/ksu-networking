import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const BOARD_CODE = process.env.BOARD_CODE || "";
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const FILES = {
  event: path.join(DATA_DIR, "event.json"),
  board: path.join(DATA_DIR, "board-members.json"),
  slots: path.join(DATA_DIR, "slots.json"),
  bookings: path.join(DATA_DIR, "bookings.json"),
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
for (const f of [FILES.slots, FILES.bookings]) {
  if (!fs.existsSync(f)) fs.writeFileSync(f, "[]\n");
}

const ALLOWED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LINKEDIN_RE = /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?(\?.*)?$/i;

// Accepts "linkedin.com/in/name", "www.linkedin.com/in/name/", or a full URL; returns a clean https URL or "".
function normalizeLinkedIn(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (!LINKEDIN_RE.test(v)) return null;
  const noProto = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("?")[0].replace(/\/$/, "");
  return `https://www.${noProto}`;
}

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
const publicBoard = () => read(FILES.board).map(({ email, ...rest }) => rest);
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const sortSlots = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = ALLOWED_TYPES.get(file.mimetype) || path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error("Resume must be a PDF or Word document (.pdf, .doc, .docx)."));
  },
});

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Public ----------
app.get("/api/event", (_req, res) => res.json(read(FILES.event)));
app.get("/api/board-members", (_req, res) => res.json(publicBoard()));

// Open and taken slots, without any student details.
app.get("/api/slots", (_req, res) => {
  const slots = read(FILES.slots)
    .map(({ id, memberId, date, time, durationMinutes, bookingId }) => ({
      id, memberId, date, time, durationMinutes, booked: Boolean(bookingId),
    }))
    .sort(sortSlots);
  res.json(slots);
});

app.post("/api/bookings", (req, res) => {
  upload.single("resume")(req, res, (err) => {
    const fail = (status, error) => {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(status).json({ error });
    };
    if (err) {
      return fail(400, err.code === "LIMIT_FILE_SIZE" ? "Resume must be 5 MB or smaller." : err.message);
    }

    const { slotId = "", name = "", email = "", major = "", gradYear = "", message = "", linkedin = "" } = req.body;
    const errors = [];
    const linkedinUrl = normalizeLinkedIn(linkedin);
    if (linkedinUrl === null) errors.push("LinkedIn should look like linkedin.com/in/your-name.");
    if (!name.trim()) errors.push("Name is required.");
    if (!/^[^\s@]+@kent\.edu$/i.test(email.trim())) errors.push("Please use your @kent.edu email address.");
    if (!req.file) errors.push("Please attach your resume.");
    if (!slotId) errors.push("Pick a time slot first.");
    if (errors.length) return fail(400, errors.join(" "));

    const slots = read(FILES.slots);
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return fail(404, "That time slot no longer exists. Please pick another.");
    if (slot.bookingId) return fail(409, "Sorry, that time was just taken. Please pick another.");

    const bookings = read(FILES.bookings);
    const studentEmail = email.trim().toLowerCase();
    if (bookings.some((b) => b.memberId === slot.memberId && b.student.email === studentEmail)) {
      return fail(409, "You already have a time with this board member. Pick someone else or email us to change it.");
    }

    const member = read(FILES.board).find((m) => m.id === slot.memberId);
    const booking = {
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
      slotId: slot.id,
      memberId: slot.memberId,
      student: {
        name: name.trim(),
        email: studentEmail,
        major: major.trim(),
        gradYear: gradYear.trim(),
        linkedin: linkedinUrl,
        message: message.trim().slice(0, 1000),
      },
      resume: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    };
    bookings.push(booking);
    slot.bookingId = booking.id;
    write(FILES.bookings, bookings);
    write(FILES.slots, slots);

    res.status(201).json({
      ok: true,
      id: booking.id,
      member: member ? member.name : slot.memberId,
      date: slot.date,
      time: slot.time,
      durationMinutes: slot.durationMinutes,
    });
  });
});

// ---------- Shared helpers for protected views ----------
function bookingsWithDetails() {
  const board = read(FILES.board);
  const byId = Object.fromEntries(board.map((m) => [m.id, m]));
  const slots = Object.fromEntries(read(FILES.slots).map((s) => [s.id, s]));
  return read(FILES.bookings)
    .map((b) => ({ ...b, member: byId[b.memberId] || { id: b.memberId, name: b.memberId }, slot: slots[b.slotId] || null }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function sendResume(req, res) {
  const safe = path.basename(req.params.storedName);
  const match = read(FILES.bookings).find((b) => b.resume.storedName === safe);
  if (!match) return res.status(404).send("Not found");
  res.download(path.join(UPLOAD_DIR, safe), match.resume.originalName);
}

// ---------- Board members (shared access code) ----------
function requireBoard(req, res, next) {
  if (!BOARD_CODE) {
    return res.status(503).json({ error: "Board sign-in is disabled. Set the BOARD_CODE environment variable to enable it." });
  }
  const provided = req.get("x-board-code") || req.query.code || "";
  if (!safeEqual(provided, BOARD_CODE)) return res.status(401).json({ error: "That access code isn't right." });
  next();
}

app.get("/board", (_req, res) => res.sendFile(path.join(__dirname, "public", "board.html")));
app.post("/api/board/verify", requireBoard, (_req, res) => res.json({ ok: true, members: publicBoard() }));

app.get("/api/board/slots", requireBoard, (req, res) => {
  const memberId = String(req.query.memberId || "");
  const bookings = Object.fromEntries(read(FILES.bookings).map((b) => [b.id, b]));
  const slots = read(FILES.slots)
    .filter((s) => s.memberId === memberId)
    .sort(sortSlots)
    .map((s) => {
      const b = s.bookingId ? bookings[s.bookingId] : null;
      return {
        ...s,
        booking: b ? { student: b.student, resume: b.resume, submittedAt: b.submittedAt } : null,
      };
    });
  res.json(slots);
});

// Add one slot (startTime only) or a block of back-to-back slots (startTime..endTime).
app.post("/api/board/slots", requireBoard, (req, res) => {
  const { memberId, date, startTime, endTime, durationMinutes } = req.body || {};
  const board = read(FILES.board);
  if (!board.some((m) => m.id === memberId)) return res.status(400).json({ error: "Unknown board member." });
  if (!DATE_RE.test(String(date))) return res.status(400).json({ error: "Please choose a date." });
  if (!TIME_RE.test(String(startTime))) return res.status(400).json({ error: "Please choose a start time." });
  const duration = Number(durationMinutes) || 20;
  if (duration < 5 || duration > 120) return res.status(400).json({ error: "Slot length must be 5–120 minutes." });

  const start = toMinutes(startTime);
  const end = endTime && TIME_RE.test(String(endTime)) ? toMinutes(endTime) : start + duration;
  if (end <= start) return res.status(400).json({ error: "End time must be after the start time." });
  if (end - start > 8 * 60) return res.status(400).json({ error: "Please add no more than 8 hours at a time." });

  const slots = read(FILES.slots);
  const mine = slots.filter((s) => s.memberId === memberId && s.date === date);
  const overlaps = (a0, a1) => mine.some((s) => {
    const b0 = toMinutes(s.time);
    const b1 = b0 + s.durationMinutes;
    return a0 < b1 && b0 < a1;
  });

  const added = [];
  for (let t = start; t + duration <= end; t += duration) {
    if (overlaps(t, t + duration)) continue;
    const slot = { id: crypto.randomBytes(5).toString("hex"), memberId, date, time: fromMinutes(t), durationMinutes: duration, bookingId: null };
    slots.push(slot);
    mine.push(slot);
    added.push(slot);
  }
  write(FILES.slots, slots);
  res.status(201).json({ ok: true, added: added.length, slots: added });
});

app.delete("/api/board/slots/:id", requireBoard, (req, res) => {
  const slots = read(FILES.slots);
  const idx = slots.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Slot not found." });
  if (slots[idx].bookingId) {
    return res.status(409).json({ error: "A student has already booked this time. Email the department to reschedule." });
  }
  slots.splice(idx, 1);
  write(FILES.slots, slots);
  res.json({ ok: true });
});

app.get("/api/board/resumes/:storedName", requireBoard, sendResume);

// ---------- Department admin ----------
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).send("Admin view is disabled. Set the ADMIN_TOKEN environment variable to enable it.");
  }
  const provided = req.query.token || req.get("x-admin-token") || "";
  if (!safeEqual(provided, ADMIN_TOKEN)) return res.status(401).send("Unauthorized");
  next();
}

app.get("/admin", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/api/admin/bookings", requireAdmin, (_req, res) => res.json(bookingsWithDetails()));
app.get("/api/admin/slots", requireAdmin, (_req, res) => res.json(read(FILES.slots).sort(sortSlots)));
app.get("/api/admin/resumes/:storedName", requireAdmin, sendResume);

app.listen(PORT, () => {
  console.log(`Resume Connect running at http://localhost:${PORT}`);
  if (!BOARD_CODE) console.log("Note: BOARD_CODE not set; board members cannot add availability at /board.");
  if (!ADMIN_TOKEN) console.log("Note: ADMIN_TOKEN not set; /admin is disabled.");
});

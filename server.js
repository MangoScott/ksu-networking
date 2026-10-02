import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const BOARD_FILE = path.join(DATA_DIR, "board-members.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(SUBMISSIONS_FILE)) fs.writeFileSync(SUBMISSIONS_FILE, "[]\n");

const ALLOWED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
}
function loadSubmissions() {
  return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf8"));
}
function saveSubmissions(list) {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2) + "\n");
}
function publicBoard() {
  // Never expose board member emails to the browser.
  return loadBoard().map(({ email, ...rest }) => rest);
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
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/board-members", (_req, res) => {
  res.json(publicBoard());
});

app.post("/api/submissions", (req, res) => {
  upload.single("resume")(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE" ? "Resume must be 5 MB or smaller." : err.message;
      return res.status(400).json({ error: message });
    }

    const { name = "", email = "", major = "", gradYear = "", message = "" } = req.body;
    let selected = req.body.boardMembers ?? [];
    if (!Array.isArray(selected)) selected = [selected];

    const errors = [];
    if (!name.trim()) errors.push("Name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email is required.");
    if (!/@kent\.edu$/i.test(email)) errors.push("Please use your @kent.edu email address.");
    if (!req.file) errors.push("Please attach your resume.");

    const board = loadBoard();
    const validIds = new Set(board.map((m) => m.id));
    selected = [...new Set(selected.map(String))].filter((id) => validIds.has(id));
    if (selected.length === 0) errors.push("Select at least one board member.");
    if (selected.length > 3) errors.push("You can select up to 3 board members.");

    if (errors.length) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: errors.join(" ") });
    }

    const submission = {
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
      student: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        major: major.trim(),
        gradYear: gradYear.trim(),
        message: message.trim().slice(0, 1000),
      },
      boardMembers: selected,
      resume: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      status: "new",
    };

    const list = loadSubmissions();
    list.push(submission);
    saveSubmissions(list);

    const names = board.filter((m) => selected.includes(m.id)).map((m) => m.name);
    res.status(201).json({ ok: true, id: submission.id, boardMembers: names });
  });
});

// --- Admin (read-only view of submissions) ---
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res
      .status(503)
      .send("Admin view is disabled. Set the ADMIN_TOKEN environment variable to enable it.");
  }
  const provided = req.query.token || req.get("x-admin-token") || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

app.get("/api/admin/submissions", requireAdmin, (_req, res) => {
  const board = loadBoard();
  const byId = Object.fromEntries(board.map((m) => [m.id, m]));
  const list = loadSubmissions().map((s) => ({
    ...s,
    boardMembers: s.boardMembers.map((id) => byId[id] || { id, name: id }),
  }));
  res.json(list.reverse());
});

app.get("/api/admin/resumes/:storedName", requireAdmin, (req, res) => {
  const safe = path.basename(req.params.storedName);
  const match = loadSubmissions().find((s) => s.resume.storedName === safe);
  if (!match) return res.status(404).send("Not found");
  res.download(path.join(UPLOAD_DIR, safe), match.resume.originalName);
});

app.get("/admin", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Resume Connect running at http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.log("Note: ADMIN_TOKEN not set; /admin is disabled.");
});

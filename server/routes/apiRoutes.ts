import { Router } from "express";
import db from "../database/db.js";
import { asyncWrapper } from "../middleware/errorHandler.js";
import { fcmService } from "../services/fcmService.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Apply authentication to all API routes
router.use(authenticate);

// FCM Tokens
router.post("/save-token", asyncWrapper(async (req: any, res: any) => {
  const { username, token } = req.body;
  if (!username || !token) {
    return res.status(400).json({ error: "Missing username or token" });
  }
  fcmService.saveToken(username, token);
  res.json({ success: true });
}));

// Settings
router.get("/settings", asyncWrapper(async (req: any, res: any) => {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  res.json(row);
}));

router.post("/settings", asyncWrapper(async (req: any, res: any) => {
  const { theme, video_url, chat_bg, chat_bg_type } = req.body;
  if (theme !== undefined) {
    db.prepare("UPDATE settings SET theme = ? WHERE id = 1").run(theme);
  }
  if (video_url !== undefined) {
    db.prepare("UPDATE settings SET video_url = ? WHERE id = 1").run(video_url);
  }
  if (chat_bg !== undefined) {
    db.prepare("UPDATE settings SET chat_bg = ? WHERE id = 1").run(chat_bg);
  }
  if (chat_bg_type !== undefined) {
    db.prepare("UPDATE settings SET chat_bg_type = ? WHERE id = 1").run(chat_bg_type);
  }
  
  const updated = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  res.json(updated);
}));

// Bucket List
router.get("/bucket-list", asyncWrapper(async (req: any, res: any) => {
  const rows = db.prepare("SELECT * FROM bucket_list ORDER BY timestamp DESC").all();
  res.json(rows);
}));

router.post("/bucket-list", asyncWrapper(async (req: any, res: any) => {
  const { title, sender } = req.body;
  const result = db.prepare("INSERT INTO bucket_list (title, sender) VALUES (?, ?)").run(title, sender);
  const newItem = { id: result.lastInsertRowid, title, completed: 0, sender, timestamp: new Date().toISOString() };
  res.json(newItem);
}));

router.post("/bucket-list/:id/toggle", asyncWrapper(async (req: any, res: any) => {
  const { id } = req.params;
  const item = db.prepare("SELECT * FROM bucket_list WHERE id = ?").get(id) as any;
  const newStatus = item.completed ? 0 : 1;
  db.prepare("UPDATE bucket_list SET completed = ? WHERE id = ?").run(newStatus, id);
  res.json({ id: parseInt(id), completed: newStatus });
}));

router.delete("/bucket-list/:id", asyncWrapper(async (req: any, res: any) => {
  const { id } = req.params;
  db.prepare("DELETE FROM bucket_list WHERE id = ?").run(id);
  res.json({ success: true });
}));

// Daily Challenge
router.get("/daily-challenge", asyncWrapper(async (req: any, res: any) => {
  const today = new Date().toISOString().split('T')[0];
  let challenge = db.prepare("SELECT * FROM daily_challenges WHERE date = ?").get(today) as any;
  
  if (!challenge) {
    const challenges = [
      "Kirim pap muka jelek kamu ke aku! 😜",
      "Kasih tau aku 1 hal yang bikin kamu sayang banget sama aku hari ini. ❤️",
      "Coba gombalin aku sampe aku baper! 🎀",
      "Kirim voice note nyanyi lagu favorit kita. 🎵",
      "Ceritain mimpi kamu semalem ke aku. 🌙",
      "Kirim foto makanan yang lagi kamu makan sekarang. 🍕",
      "Sebutin 3 hal yang mau kamu lakuin pas kita ketemu nanti. ✨"
    ];
    const randomText = challenges[Math.floor(Math.random() * challenges.length)];
    db.prepare("INSERT INTO daily_challenges (text, exp, date) VALUES (?, ?, ?)").run(randomText, 20, today);
    challenge = db.prepare("SELECT * FROM daily_challenges WHERE date = ?").get(today);
  }
  res.json(challenge);
}));

router.post("/daily-challenge/complete", asyncWrapper(async (req: any, res: any) => {
  const { username } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const column = username === "Harsya" ? "completed_by_harsya" : "completed_by_ayas";
  
  db.prepare(`UPDATE daily_challenges SET ${column} = 1 WHERE date = ?`).run(today);
  const updatedChallenge = db.prepare("SELECT * FROM daily_challenges WHERE date = ?").get(today);
  res.json({ challenge: updatedChallenge });
}));

// Open When
router.get("/open-when", asyncWrapper(async (req: any, res: any) => {
  const rows = db.prepare("SELECT * FROM open_when ORDER BY timestamp DESC").all();
  res.json(rows);
}));

router.post("/open-when", asyncWrapper(async (req: any, res: any) => {
  const { category, content, imageUrl, type, sender } = req.body;
  const result = db.prepare("INSERT INTO open_when (category, content, imageUrl, type, sender) VALUES (?, ?, ?, ?, ?)").run(category, content, imageUrl, type, sender);
  const newMessage = { id: result.lastInsertRowid, category, content, imageUrl, type, sender, timestamp: new Date().toISOString() };
  res.json(newMessage);
}));

// Gallery
router.get("/gallery", asyncWrapper(async (req: any, res: any) => {
  const rows = db.prepare("SELECT * FROM gallery ORDER BY timestamp DESC").all();
  res.json(rows);
}));

router.post("/gallery", asyncWrapper(async (req: any, res: any) => {
  const { url, caption, sender } = req.body;
  const result = db.prepare("INSERT INTO gallery (url, caption, sender) VALUES (?, ?, ?)").run(url, caption, sender);
  const newPhoto = { id: result.lastInsertRowid, url, caption, sender, timestamp: new Date().toISOString() };
  res.json(newPhoto);
}));

router.delete("/gallery/:id", asyncWrapper(async (req: any, res: any) => {
  const { id } = req.params;
  db.prepare("DELETE FROM gallery WHERE id = ?").run(id);
  res.json({ success: true });
}));

// Memories
router.get("/memories", asyncWrapper(async (req: any, res: any) => {
  const rows = db.prepare("SELECT * FROM memories ORDER BY id ASC").all();
  res.json(rows);
}));

router.put("/memories/:id", asyncWrapper(async (req: any, res: any) => {
  const { id } = req.params;
  const { title, desc, date } = req.body;
  db.prepare("UPDATE memories SET title = ?, desc = ?, date = ? WHERE id = ?").run(title, desc, date, id);
  res.json({ success: true });
}));

export default router;

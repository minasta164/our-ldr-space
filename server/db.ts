import Database from "better-sqlite3";
import path from "path";
import { initAuthTables } from "./services/authService.js";

// The database file is in the root directory
const dbPath = path.join(process.cwd(), "acaya.db");
const db = new Database(dbPath);

// Disable WAL mode for better persistence in this environment
db.pragma('journal_mode = DELETE');

// Initialize DB tables and indexes
export function initDb() {
  // Initialize Auth Schema & Users
  initAuthTables();

  db.exec(`
    CREATE TABLE IF NOT EXISTS open_when (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      content TEXT,
      imageUrl TEXT,
      type TEXT, -- 'text', 'image', or 'both'
      sender TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT,
      caption TEXT,
      sender TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      sender TEXT,
      text TEXT,
      voiceUrl TEXT,
      seen INTEGER DEFAULT 0,
      status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read'
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      title TEXT,
      desc TEXT,
      icon TEXT,
      locked INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'default',
      video_url TEXT DEFAULT '',
      chat_bg TEXT DEFAULT '',
      chat_bg_type TEXT DEFAULT 'color'
    );
    INSERT OR IGNORE INTO settings (id, theme, video_url, chat_bg, chat_bg_type) VALUES (1, 'default', '', '#FDFCFB', 'color');

    CREATE TABLE IF NOT EXISTS profiles (
      username TEXT PRIMARY KEY,
      nickname TEXT,
      profilePic TEXT,
      bio TEXT,
      mood TEXT DEFAULT 'Happy',
      mood_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      focus TEXT DEFAULT 'Available',
      focus_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO profiles (username, nickname) VALUES ('Harsya', 'Harsya');
    INSERT OR IGNORE INTO profiles (username, nickname) VALUES ('Ayas', 'Ayas');

    CREATE TABLE IF NOT EXISTS bucket_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      completed INTEGER DEFAULT 0,
      sender TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT,
      exp INTEGER,
      completed_by_harsya INTEGER DEFAULT 0,
      completed_by_ayas INTEGER DEFAULT 0,
      date TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      token TEXT UNIQUE,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for existing tables
  try {
    db.exec("ALTER TABLE messages ADD COLUMN uuid TEXT;");
  } catch (e) {}
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid);");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN voiceUrl TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN seen INTEGER DEFAULT 0;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'sent';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN attachmentUrl TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN attachmentName TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN attachmentType TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE messages ADD COLUMN attachmentSize INTEGER;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE settings ADD COLUMN video_url TEXT DEFAULT '';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE settings ADD COLUMN chat_bg TEXT DEFAULT '';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE settings ADD COLUMN chat_bg_type TEXT DEFAULT 'color';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE gallery ADD COLUMN sender TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE open_when ADD COLUMN imageUrl TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE profiles ADD COLUMN mood TEXT DEFAULT 'Happy';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE profiles ADD COLUMN mood_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE profiles ADD COLUMN bio TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE profiles ADD COLUMN focus TEXT DEFAULT 'Available';");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE profiles ADD COLUMN focus_timestamp DATETIME;");
    // Update existing rows if the column was just added
    db.exec("UPDATE profiles SET focus_timestamp = CURRENT_TIMESTAMP WHERE focus_timestamp IS NULL;");
  } catch (e) {}

  // Seed initial memories if empty
  const memoryCount = db.prepare("SELECT COUNT(*) as count FROM memories").get() as any;
  if (memoryCount.count === 0) {
    const initialMemories = [
      { date: "10 Nov 2025", title: "First Time Call", desc: "Suara kamu yang bikin aku deg-degan parah lewat telepon pertama kita. 📞🤍", icon: "MusicIcon" },
      { date: "15 Nov 2025", title: "A Turning Point", desc: "Hari dimana semua berubah tidak seperti biasanya, awal dari segalanya. ✨", icon: "Sparkles" },
      { date: "24 Des 2025", title: "Christmas Night", desc: "Nonton film bareng lewat Discord. Cozy banget!", icon: "ImageIcon" },
      { date: "01 Jan 2026", title: "New Year Wish", desc: "Janji buat tetep bareng di tahun yang baru. ✨", icon: "Calendar" },
      { date: "14 Feb 2026", title: "Valentine LDR", desc: "Cuma bisa liat kamu di layar, tapi rasa sayangnya nyata.", icon: "Lock" },
      { date: "Coming Soon", title: "The Wedding", desc: "Mimpi kita yang bakal jadi nyata sebentar lagi. 🎀", icon: "Sparkles", locked: 1 },
    ];
    const insert = db.prepare("INSERT INTO memories (date, title, desc, icon, locked) VALUES (?, ?, ?, ?, ?)");
    initialMemories.forEach(m => insert.run(m.date, m.title, m.desc, m.icon, m.locked || 0));
  }
}

export default db;

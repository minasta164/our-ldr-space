import crypto from "crypto";
import bcrypt from "bcryptjs";
import db from "../db.js";

const SALT_ROUNDS = 10;
const SESSION_DURATION_DAYS = 30;

export interface UserSession {
  userId: number;
  username: "Harsya" | "Ayas";
  expiresAt: string;
}

export function initAuthTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      recovery_code_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      session_token_hash TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON user_sessions(session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_username ON user_sessions(username);

    CREATE TABLE IF NOT EXISTS partner_recovery_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_username TEXT NOT NULL,
      partner_username TEXT NOT NULL,
      recovery_secret_hash TEXT,
      reset_token_hash TEXT,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'used', 'expired'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      token_expires_at DATETIME
    );
  `);

  // Seamless schema migration for partner_recovery_requests
  try {
    const tableInfo = db.prepare("PRAGMA table_info(partner_recovery_requests)").all() as any[];
    const hasLegacyTokenHash = tableInfo.some((col: any) => col.name === "recovery_token_hash");
    if (hasLegacyTokenHash) {
      db.exec(`
        CREATE TABLE partner_recovery_requests_clean (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_username TEXT NOT NULL,
          partner_username TEXT NOT NULL,
          recovery_secret_hash TEXT,
          reset_token_hash TEXT,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          token_expires_at DATETIME
        );
        INSERT INTO partner_recovery_requests_clean (id, target_username, partner_username, status, created_at, expires_at)
        SELECT id, target_username, partner_username, status, created_at, expires_at FROM partner_recovery_requests;
        DROP TABLE partner_recovery_requests;
        ALTER TABLE partner_recovery_requests_clean RENAME TO partner_recovery_requests;
      `);
    }
  } catch (e) {}

  try {
    db.exec("ALTER TABLE partner_recovery_requests ADD COLUMN recovery_secret_hash TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE partner_recovery_requests ADD COLUMN reset_token_hash TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE partner_recovery_requests ADD COLUMN token_expires_at DATETIME;");
  } catch (e) {}

  // Seed default users if they do not exist
  const harsyaUser = db.prepare("SELECT * FROM users WHERE username = ?").get("Harsya");
  if (!harsyaUser) {
    const defaultPasswordHash = bcrypt.hashSync("Harsya123!", SALT_ROUNDS);
    const defaultRecoveryCodeHash = bcrypt.hashSync("HARSYA-SECURE-2026", SALT_ROUNDS);
    db.prepare("INSERT INTO users (username, password_hash, recovery_code_hash) VALUES (?, ?, ?)")
      .run("Harsya", defaultPasswordHash, defaultRecoveryCodeHash);
    console.log("Seeded initial account for Harsya");
  }

  const ayasUser = db.prepare("SELECT * FROM users WHERE username = ?").get("Ayas");
  if (!ayasUser) {
    const defaultPasswordHash = bcrypt.hashSync("Ayas123!", SALT_ROUNDS);
    const defaultRecoveryCodeHash = bcrypt.hashSync("AYAS-SECURE-2026", SALT_ROUNDS);
    db.prepare("INSERT INTO users (username, password_hash, recovery_code_hash) VALUES (?, ?, ?)")
      .run("Ayas", defaultPasswordHash, defaultRecoveryCodeHash);
    console.log("Seeded initial account for Ayas");
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRandomCode(prefix = "ACTA"): string {
  const bytes = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
}

export async function loginUser(username: string, password: string): Promise<{ sessionToken: string; user: any } | null> {
  if (username !== "Harsya" && username !== "Ayas") {
    return null;
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user) {
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return null;
  }

  // Generate high-entropy session token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + SESSION_DURATION_DAYS);
  const expiresAt = expiresDate.toISOString();

  db.prepare(`
    INSERT INTO user_sessions (user_id, username, session_token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, user.username, tokenHash, expiresAt);

  const profile = db.prepare("SELECT * FROM profiles WHERE username = ?").get(username) as any;

  return {
    sessionToken: rawToken,
    user: {
      id: user.id,
      username: user.username,
      nickname: profile?.nickname || user.username,
      profilePic: profile?.profilePic,
      bio: profile?.bio,
      mood: profile?.mood,
      focus: profile?.focus,
    },
  };
}

export function verifySessionToken(token: string): UserSession | null {
  if (!token || typeof token !== "string") return null;

  const tokenHash = hashToken(token);
  const session = db.prepare(`
    SELECT s.user_id, s.username, s.expires_at, s.is_revoked
    FROM user_sessions s
    WHERE s.session_token_hash = ? AND s.is_revoked = 0
  `).get(tokenHash) as any;

  if (!session) return null;

  const now = new Date();
  const expires = new Date(session.expires_at);
  if (now > expires) {
    // Session expired
    db.prepare("UPDATE user_sessions SET is_revoked = 1 WHERE session_token_hash = ?").run(tokenHash);
    return null;
  }

  return {
    userId: session.user_id,
    username: session.username,
    expiresAt: session.expires_at,
  };
}

export function revokeSession(token: string): boolean {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const result = db.prepare("UPDATE user_sessions SET is_revoked = 1 WHERE session_token_hash = ?").run(tokenHash);
  return result.changes > 0;
}

export function revokeAllUserSessions(username: string): void {
  db.prepare("UPDATE user_sessions SET is_revoked = 1 WHERE username = ?").run(username);
}

export async function changeUserPassword(username: string, currentPass: string, newPass: string): Promise<{ success: boolean; newSessionToken?: string; error?: string }> {
  if (username !== "Harsya" && username !== "Ayas") {
    return { success: false, error: "Akun tidak valid" };
  }

  if (!newPass || newPass.length < 6) {
    return { success: false, error: "Password baru minimal 6 karakter" };
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user) {
    return { success: false, error: "Pengguna tidak ditemukan" };
  }

  const isMatch = await bcrypt.compare(currentPass, user.password_hash);
  if (!isMatch) {
    return { success: false, error: "Password saat ini salah" };
  }

  const newHash = await bcrypt.hash(newPass, SALT_ROUNDS);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, user.id);

  // Invalidate previous sessions
  revokeAllUserSessions(username);

  // Create fresh session for this client
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + SESSION_DURATION_DAYS);
  db.prepare(`
    INSERT INTO user_sessions (user_id, username, session_token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, username, tokenHash, expiresDate.toISOString());

  return { success: true, newSessionToken: rawToken };
}

export async function generateNewRecoveryCode(username: string): Promise<string> {
  const newCode = generateRandomCode("ACTA");
  const hash = await bcrypt.hash(newCode, SALT_ROUNDS);
  db.prepare("UPDATE users SET recovery_code_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(hash, username);
  return newCode;
}

export async function resetPasswordWithRecoveryCode(username: string, recoveryCode: string, newPassword: string): Promise<{ success: boolean; newRecoveryCode?: string; error?: string }> {
  if (username !== "Harsya" && username !== "Ayas") {
    return { success: false, error: "Akun tidak valid" };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "Password baru minimal 6 karakter" };
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user || !user.recovery_code_hash) {
    return { success: false, error: "Recovery code belum diset untuk akun ini" };
  }

  const cleanCode = recoveryCode.trim().toUpperCase();
  const isMatch = await bcrypt.compare(cleanCode, user.recovery_code_hash);
  if (!isMatch) {
    return { success: false, error: "Recovery code tidak valid atau salah" };
  }

  const newPassHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const newRecoveryCode = generateRandomCode("ACTA");
  const newRecoveryCodeHash = await bcrypt.hash(newRecoveryCode, SALT_ROUNDS);

  db.prepare(`
    UPDATE users 
    SET password_hash = ?, recovery_code_hash = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(newPassHash, newRecoveryCodeHash, user.id);

  // Invalidate all existing sessions
  revokeAllUserSessions(username);

  return { success: true, newRecoveryCode };
}

export function requestPartnerRecovery(targetUsername: string): { success: boolean; requestId?: number; recoverySecret?: string; error?: string } {
  if (targetUsername !== "Harsya" && targetUsername !== "Ayas") {
    return { success: false, error: "Target akun tidak valid" };
  }

  const partnerUsername = targetUsername === "Harsya" ? "Ayas" : "Harsya";

  // Invalidate old pending requests
  db.prepare("UPDATE partner_recovery_requests SET status = 'rejected' WHERE target_username = ? AND status = 'pending'").run(targetUsername);

  // Generate random high-entropy recovery secret
  const recoverySecret = crypto.randomBytes(32).toString("hex");
  const secretHash = hashToken(recoverySecret);

  const expiresDate = new Date();
  expiresDate.setMinutes(expiresDate.getMinutes() + 15); // 15 mins window

  const result = db.prepare(`
    INSERT INTO partner_recovery_requests (target_username, partner_username, recovery_secret_hash, status, expires_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(targetUsername, partnerUsername, secretHash, expiresDate.toISOString());

  return {
    success: true,
    requestId: Number(result.lastInsertRowid),
    recoverySecret, // Sent only once to requester browser
  };
}

export function getPendingPartnerRequests(partnerUsername: string): any[] {
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT id, target_username, partner_username, created_at, expires_at
    FROM partner_recovery_requests
    WHERE partner_username = ? AND status = 'pending' AND expires_at > ?
    ORDER BY created_at DESC
  `).all(partnerUsername, now) as any[];
}

export function getPartnerRequestStatus(targetUsername: string, recoverySecret?: string): { status: string; resetToken?: string; error?: string } {
  if (!recoverySecret || typeof recoverySecret !== "string") {
    return { status: "unauthorized", error: "Recovery secret is required." };
  }

  const secretHash = hashToken(recoverySecret.trim());
  const now = new Date().toISOString();
  const req = db.prepare(`
    SELECT *
    FROM partner_recovery_requests
    WHERE target_username = ? AND recovery_secret_hash = ?
    ORDER BY id DESC LIMIT 1
  `).get(targetUsername, secretHash) as any;

  if (!req) {
    return { status: "forbidden", error: "Recovery secret tidak valid atau tidak cocok." };
  }

  if (req.status === "pending") {
    if (req.expires_at < now) {
      db.prepare("UPDATE partner_recovery_requests SET status = 'expired' WHERE id = ?").run(req.id);
      return { status: "expired" };
    }
    return { status: "pending" };
  }

  if (req.status === "rejected") {
    return { status: "rejected" };
  }

  if (req.status === "used") {
    return { status: "used" };
  }

  if (req.status === "expired") {
    return { status: "expired" };
  }

  if (req.status === "approved") {
    if (req.token_expires_at && req.token_expires_at < now) {
      db.prepare("UPDATE partner_recovery_requests SET status = 'expired' WHERE id = ?").run(req.id);
      return { status: "expired" };
    }

    // Generate high-entropy reset token and store only hash in DB (not in-memory, persistent across restart)
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashToken(rawResetToken);
    const tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 mins validity

    db.prepare(`
      UPDATE partner_recovery_requests
      SET reset_token_hash = ?, token_expires_at = ?
      WHERE id = ?
    `).run(resetTokenHash, tokenExpiresAt, req.id);

    return { status: "approved", resetToken: rawResetToken };
  }

  return { status: req.status };
}

export function approvePartnerRequest(partnerUsername: string, requestId: number): { success: boolean; error?: string } {
  const now = new Date().toISOString();
  const req = db.prepare(`
    SELECT * FROM partner_recovery_requests 
    WHERE id = ? AND partner_username = ? AND status = 'pending' AND expires_at > ?
  `).get(requestId, partnerUsername, now) as any;

  if (!req) {
    return { success: false, error: "Permintaan tidak ditemukan atau telah kedaluwarsa" };
  }

  db.prepare(`
    UPDATE partner_recovery_requests
    SET status = 'approved'
    WHERE id = ?
  `).run(requestId);

  return { success: true };
}

export function rejectPartnerRequest(partnerUsername: string, requestId: number): boolean {
  const result = db.prepare(`
    UPDATE partner_recovery_requests
    SET status = 'rejected'
    WHERE id = ? AND partner_username = ? AND status = 'pending'
  `).run(requestId, partnerUsername);
  return result.changes > 0;
}

export async function resetPasswordWithPartnerToken(
  targetUsername: string, 
  resetToken: string, 
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (targetUsername !== "Harsya" && targetUsername !== "Ayas") {
    return { success: false, error: "Akun tidak valid" };
  }

  if (!resetToken || typeof resetToken !== "string") {
    return { success: false, error: "Reset token tidak valid" };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "Password baru minimal 6 karakter" };
  }

  const resetTokenHash = hashToken(resetToken.trim());
  const now = new Date().toISOString();
  const req = db.prepare(`
    SELECT * FROM partner_recovery_requests
    WHERE target_username = ? AND reset_token_hash = ? AND status = 'approved' AND (token_expires_at IS NULL OR token_expires_at > ?)
    ORDER BY id DESC LIMIT 1
  `).get(targetUsername, resetTokenHash, now) as any;

  if (!req) {
    return { success: false, error: "Reset token tidak valid, sudah digunakan, atau telah kedaluwarsa" };
  }

  // Mark request as used immediately and clear reset_token_hash to prevent replay
  db.prepare("UPDATE partner_recovery_requests SET status = 'used', reset_token_hash = NULL WHERE id = ?").run(req.id);

  const newPassHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(newPassHash, targetUsername);

  // Invalidate ALL existing sessions for target user
  revokeAllUserSessions(targetUsername);

  return { success: true };
}

import { Request, Response, NextFunction } from "express";
import { verifySessionToken, UserSession } from "../services/authService.js";

const STATIC_SYSTEM_TOKEN = process.env.AUTH_TOKEN || "secret-token";

export interface AuthenticatedRequest extends Request {
  user?: UserSession;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const sessionTokenHeader = req.headers["x-session-token"] as string;
  const legacyToken = req.headers["x-auth-token"] as string;

  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (sessionTokenHeader) {
    token = sessionTokenHeader.trim();
  } else if (legacyToken && legacyToken !== STATIC_SYSTEM_TOKEN) {
    token = legacyToken.trim();
  }

  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      req.user = session;
      return next();
    }
  }

  // Fallback for internal system-to-system calls with static token
  if (legacyToken === STATIC_SYSTEM_TOKEN || req.query.token === STATIC_SYSTEM_TOKEN) {
    return next();
  }

  return res.status(401).json({ error: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali." });
}

// BOLA / Authorization check: ensures authenticated user matches resource owner
export function requireSelf(paramName = "username") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      // If accessed via system static token, allow
      const legacyToken = req.headers["x-auth-token"] as string;
      if (legacyToken === STATIC_SYSTEM_TOKEN) return next();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const targetUser = req.params[paramName] || req.body[paramName];
    if (targetUser && targetUser !== req.user.username) {
      return res.status(403).json({ error: "Anda tidak memiliki izin untuk mengubah data akun lain." });
    }

    next();
  };
}

// Simple input validation middleware
export function validate(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const key in schema) {
      if (schema[key].required && (req.body[key] === undefined || req.body[key] === null || req.body[key] === "")) {
        return res.status(400).json({ error: `${key} is required` });
      }
      if (req.body[key] && schema[key].type && typeof req.body[key] !== schema[key].type) {
        return res.status(400).json({ error: `${key} must be of type ${schema[key].type}` });
      }
    }
    next();
  };
}

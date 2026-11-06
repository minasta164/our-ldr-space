import { Router, Response } from "express";
import { 
  loginUser, 
  revokeSession, 
  changeUserPassword, 
  generateNewRecoveryCode, 
  resetPasswordWithRecoveryCode, 
  requestPartnerRecovery, 
  getPendingPartnerRequests, 
  getPartnerRequestStatus, 
  approvePartnerRequest, 
  rejectPartnerRequest, 
  resetPasswordWithPartnerToken 
} from "../services/authService.js";
import { authenticate, AuthenticatedRequest, validate } from "../middleware/auth.js";
import { emitPartnerRecoveryRequested } from "../sockets/socketHandler.js";
import db from "../db.js";

const router = Router();

// 1. Login
router.post("/login", validate({
  username: { required: true, type: "string" },
  password: { required: true, type: "string" }
}), async (req, res) => {
  const { username, password } = req.body;
  const result = await loginUser(username, password);

  if (!result) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  res.json({
    success: true,
    sessionToken: result.sessionToken,
    user: result.user,
  });
});

// 2. Get Current Authenticated User
router.get("/me", authenticate, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const profile = db.prepare("SELECT * FROM profiles WHERE username = ?").get(req.user.username) as any;
  res.json({
    authenticated: true,
    user: {
      userId: req.user.userId,
      username: req.user.username,
      nickname: profile?.nickname || req.user.username,
      profilePic: profile?.profilePic,
      bio: profile?.bio,
      mood: profile?.mood,
      focus: profile?.focus,
    },
  });
});

// 3. Logout
router.post("/logout", (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  const sessionTokenHeader = req.headers["x-session-token"] as string;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (sessionTokenHeader) {
    token = sessionTokenHeader.trim();
  }

  if (token) {
    revokeSession(token);
  }

  res.json({ success: true, message: "Logged out successfully" });
});

// 4. Change Password (Authenticated Self Only)
router.post("/change-password", authenticate, validate({
  currentPassword: { required: true, type: "string" },
  newPassword: { required: true, type: "string" },
}), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body;
  const result = await changeUserPassword(req.user.username, currentPassword, newPassword);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: "Password berhasil diubah.",
    newSessionToken: result.newSessionToken,
  });
});

// 5. Generate New Recovery Code (Authenticated Self Only)
router.post("/generate-recovery-code", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const code = await generateNewRecoveryCode(req.user.username);
  res.json({
    success: true,
    recoveryCode: code,
    message: "Simpan Recovery Code ini di tempat yang aman. Kode ini hanya ditampilkan sekali.",
  });
});

// 6. Reset Password with Recovery Code
router.post("/recovery/code", validate({
  username: { required: true, type: "string" },
  recoveryCode: { required: true, type: "string" },
  newPassword: { required: true, type: "string" },
}), async (req, res) => {
  const { username, recoveryCode, newPassword } = req.body;
  const result = await resetPasswordWithRecoveryCode(username, recoveryCode, newPassword);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: "Password berhasil direset. Silakan login dengan password baru.",
    newRecoveryCode: result.newRecoveryCode,
  });
});

// 7. Request Partner Approval for Password Reset
router.post("/recovery/request-partner", validate({
  username: { required: true, type: "string" },
}), (req, res) => {
  const { username } = req.body;
  const result = requestPartnerRecovery(username);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Real-time socket notification to partner
  if (result.requestId) {
    emitPartnerRecoveryRequested(username as "Harsya" | "Ayas", result.requestId);
  }

  res.json({
    success: true,
    requestId: result.requestId,
    recoverySecret: result.recoverySecret,
    message: "Permintaan reset password telah dikirim ke pasanganmu. Menunggu persetujuan...",
  });
});

// 8. Check Status of Partner Request (Requires Recovery Secret)
router.get("/recovery/status/:username", (req, res) => {
  const { username } = req.params;
  const secret = (req.query.secret as string) || (req.headers["x-recovery-secret"] as string);

  if (!secret) {
    return res.status(401).json({ error: "Recovery secret is required" });
  }

  const result = getPartnerRequestStatus(username, secret);
  if (result.status === "unauthorized") {
    return res.status(401).json({ error: result.error });
  }
  if (result.status === "forbidden") {
    return res.status(403).json({ error: result.error });
  }

  res.json(result);
});

// 9. Get Pending Partner Recovery Requests for Authenticated Partner
router.get("/recovery/pending-approvals", authenticate, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const requests = getPendingPartnerRequests(req.user.username);
  res.json({ requests });
});

// 10. Approve Partner Request (Authenticated Partner Only)
router.post("/recovery/approve", authenticate, validate({
  requestId: { required: true, type: "number" },
}), (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { requestId } = req.body;
  const result = approvePartnerRequest(req.user.username, requestId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: "Permintaan reset password pasangan telah disetujui.",
  });
});

// 11. Reject Partner Request (Authenticated Partner Only)
router.post("/recovery/reject", authenticate, validate({
  requestId: { required: true, type: "number" },
}), (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { requestId } = req.body;
  const success = rejectPartnerRequest(req.user.username, requestId);

  if (!success) {
    return res.status(400).json({ error: "Gagal menolak permintaan." });
  }

  res.json({ success: true, message: "Permintaan ditolak." });
});

// 12. Complete Reset with Approved Partner Request & Reset Token
router.post("/recovery/partner-reset", validate({
  username: { required: true, type: "string" },
  resetToken: { required: true, type: "string" },
  newPassword: { required: true, type: "string" },
}), async (req, res) => {
  const { username, resetToken, newPassword } = req.body;
  const result = await resetPasswordWithPartnerToken(username, resetToken, newPassword);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: "Password berhasil direset melalui persetujuan pasangan. Silakan login dengan password baru.",
  });
});

export default router;

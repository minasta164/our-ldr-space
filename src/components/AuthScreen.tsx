import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw, Sparkles, User as UserIcon, AlertCircle, CheckCircle2, HeartHandshake } from "lucide-react";
import { UserProfile } from "../types";
import { fetchWithAuth, setSessionToken, safeParseJson } from "../utils/api";

interface AuthScreenProps {
  profiles: UserProfile[];
  onLoginSuccess: (user: "Harsya" | "Ayas", profileData?: any) => void;
}

type AuthMode = "select_account" | "enter_password" | "forgot_password" | "partner_approval_waiting" | "partner_approval_reset";

export function AuthScreen({ profiles, onLoginSuccess }: AuthScreenProps) {
  const [selectedUser, setSelectedUser] = useState<"Harsya" | "Ayas" | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("select_account");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Recovery Code state
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newGeneratedCode, setNewGeneratedCode] = useState("");

  // Partner Approval state
  const [partnerStatusPolling, setPartnerStatusPolling] = useState(false);
  const [recoverySecret, setRecoverySecret] = useState("");
  const [partnerResetToken, setPartnerResetToken] = useState("");

  const getProfile = (username: string) => profiles.find((p) => p.username === username);

  const handleAccountSelect = (username: "Harsya" | "Ayas") => {
    setSelectedUser(username);
    setPassword("");
    setErrorMessage("");
    setSuccessMessage("");
    setAuthMode("enter_password");
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUser || !password) {
      setErrorMessage("Silakan masukkan kata sandi kamu.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: selectedUser,
          password: password,
        }),
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setErrorMessage(parseResult.error || "Kata sandi salah. Silakan coba lagi.");
        setIsLoading(false);
        return;
      }

      const data = parseResult.data;
      // Save token to localStorage
      setSessionToken(data.sessionToken);
      localStorage.setItem("acaya_user", selectedUser);

      onLoginSuccess(selectedUser, data.user);
    } catch (err: any) {
      console.error("Login error:", err);
      setErrorMessage("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password with Recovery Code
  const handleResetWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!recoveryCode.trim()) {
      setErrorMessage("Masukkan Recovery Code kamu.");
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi password baru tidak cocok.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/recovery/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: selectedUser,
          recoveryCode: recoveryCode.trim(),
          newPassword: newPassword,
        }),
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setErrorMessage(parseResult.error || "Recovery Code salah atau tidak valid.");
        setIsLoading(false);
        return;
      }

      const data = parseResult.data;
      setNewGeneratedCode(data.newRecoveryCode || "");
      setSuccessMessage("Password berhasil direset! Gunakan password baru kamu untuk login.");
      setPassword(newPassword);
      setAuthMode("enter_password");
    } catch (err) {
      setErrorMessage("Gagal mereset password. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  // Request Partner Approval
  const handleRequestPartnerApproval = async () => {
    if (!selectedUser) return;
    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/recovery/request-partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedUser }),
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setErrorMessage(parseResult.error || "Gagal mengirim permintaan ke pasangan.");
        setIsLoading(false);
        return;
      }

      const data = parseResult.data;
      if (data.recoverySecret) {
        setRecoverySecret(data.recoverySecret);
      }
      setAuthMode("partner_approval_waiting");
      setPartnerStatusPolling(true);
    } catch (err) {
      setErrorMessage("Gagal menghubungi server.");
    } finally {
      setIsLoading(false);
    }
  };

  // Polling partner approval status with recovery secret
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (partnerStatusPolling && selectedUser && recoverySecret && authMode === "partner_approval_waiting") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/auth/recovery/status/${selectedUser}?secret=${encodeURIComponent(recoverySecret)}`);
          const parseResult = await safeParseJson(res);
          if (parseResult.success && parseResult.data) {
            const data = parseResult.data;
            if (data.status === "approved" && data.resetToken) {
              setPartnerResetToken(data.resetToken);
              setPartnerStatusPolling(false);
              setAuthMode("partner_approval_reset");
            } else if (data.status === "rejected") {
              setPartnerStatusPolling(false);
              setRecoverySecret("");
              setErrorMessage("Permintaan reset ditolak oleh pasangan kamu.");
              setAuthMode("forgot_password");
            } else if (data.status === "expired") {
              setPartnerStatusPolling(false);
              setRecoverySecret("");
              setErrorMessage("Permintaan reset telah kedaluwarsa.");
              setAuthMode("forgot_password");
            }
          }
        } catch (e) {
          console.warn("Polling partner error", e);
        }
      }, 2500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [partnerStatusPolling, selectedUser, recoverySecret, authMode]);

  // Complete reset with approved partner token
  const handlePartnerResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!partnerResetToken) {
      setErrorMessage("Reset token tidak ditemukan. Silakan ulangi permintaan.");
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/recovery/partner-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: selectedUser,
          resetToken: partnerResetToken,
          newPassword: newPassword,
        }),
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setErrorMessage(parseResult.error || "Gagal mereset password.");
        setIsLoading(false);
        return;
      }

      setSuccessMessage("Password berhasil direset! Silakan login.");
      setPassword(newPassword);
      setRecoverySecret("");
      setPartnerResetToken("");
      setAuthMode("enter_password");
    } catch (err) {
      setErrorMessage("Terjadi kesalahan.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-soft-pink/90 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-md my-auto space-y-6 text-center">
        {/* Top Branding Badge */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm"
        >
          <Sparkles size={14} className="text-deep-pink" />
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.3em]">Tentang Kita • Ruang Aman LDR</span>
        </motion.div>

        {/* Global Notifications */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left shadow-sm"
          >
            <AlertCircle size={18} className="flex-shrink-0 text-rose-500" />
            <span className="font-medium">{errorMessage}</span>
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs text-left shadow-sm"
          >
            <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-500" />
            <span className="font-medium">{successMessage}</span>
          </motion.div>
        )}

        {newGeneratedCode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs text-left space-y-2 shadow-sm"
          >
            <div className="font-bold flex items-center gap-1.5">
              <KeyRound size={16} className="text-amber-600" />
              <span>Recovery Code Baru Kamu:</span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-amber-300 font-mono text-sm tracking-wider font-black text-zinc-900 text-center select-all">
              {newGeneratedCode}
            </div>
            <p className="text-[11px] text-amber-700">Simpan kode ini baik-baik. Kode lama sudah tidak berlaku.</p>
          </motion.div>
        )}

        {/* --- VIEW 1: Account Selection --- */}
        {authMode === "select_account" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-5xl font-serif text-zinc-900 tracking-tight">Siapa yang Datang?</h1>
              <p className="text-xs text-zinc-500 font-medium">Pilih akunmu dan masukkan kata sandi</p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {(["Harsya", "Ayas"] as const).map((username) => {
                const p = getProfile(username);
                return (
                  <button
                    key={username}
                    onClick={() => handleAccountSelect(username)}
                    className="liquid-glass p-6 sm:p-8 rounded-[2.5rem] flex flex-col items-center gap-4 group hover:border-white/90 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 relative overflow-hidden shadow-xl"
                  >
                    <div className="glass-noise" />
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2rem] overflow-hidden bg-white/70 flex items-center justify-center text-zinc-300 group-hover:text-deep-pink transition-all duration-500 border border-white/80 group-hover:border-white shadow-md relative z-10">
                      {p?.profilePic ? (
                        <img src={p.profilePic} alt={username} className="w-full h-full object-cover grayscale-[0.1] group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon size={44} fill="currentColor" />
                      )}
                    </div>
                    <div className="flex flex-col space-y-1 relative z-10">
                      <span className="font-serif text-lg font-bold text-zinc-900 tracking-tight">{p?.nickname || username}</span>
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.2em]">@{username}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* --- VIEW 2: Password Form --- */}
        {authMode === "enter_password" && selectedUser && (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.98 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: -15, scale: 0.98 }} 
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between px-3">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("select_account");
                  setErrorMessage("");
                }}
                className="group inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-800 transition-colors py-1 px-2 rounded-xl hover:bg-white/40"
              >
                <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
                <span className="tracking-wide">Ganti Akun</span>
              </button>
              <span className="text-[11px] font-medium text-zinc-400/80 px-2.5 py-1 rounded-full bg-white/50 border border-white/80">
                @{selectedUser}
              </span>
            </div>

            <div className="liquid-glass p-8 sm:p-10 rounded-[2.75rem] space-y-7 shadow-2xl shadow-zinc-950/5 border border-white/90 relative overflow-hidden text-center">
              <div className="glass-noise" />

              {/* Avatar & Personal Greeting */}
              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="relative p-1 rounded-[2.2rem] bg-gradient-to-b from-white/90 to-white/40 shadow-lg shadow-zinc-950/5 border border-white/90">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[1.95rem] overflow-hidden bg-white/90 flex items-center justify-center">
                    {getProfile(selectedUser)?.profilePic ? (
                      <img 
                        src={getProfile(selectedUser)?.profilePic} 
                        alt={selectedUser} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300 bg-zinc-50/60">
                        <UserIcon size={38} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-serif text-zinc-900 tracking-tight font-normal">
                    Halo, {getProfile(selectedUser)?.nickname || selectedUser}!
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 font-normal">
                    Masukkan kata sandi akunmu
                  </p>
                </div>
              </div>

              {/* Form Input & Action */}
              <form onSubmit={handleLogin} className="space-y-5 relative z-10 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] ml-1">
                    Kata Sandi
                  </label>
                  <div className="relative group">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi..."
                      autoFocus
                      required
                      className="w-full bg-white/90 border border-zinc-200/90 hover:border-zinc-300 focus:border-zinc-700 rounded-2xl px-4 py-3.5 pr-12 text-sm sm:text-base text-zinc-900 placeholder:text-zinc-400/80 focus:outline-none focus:ring-4 focus:ring-zinc-900/5 transition-all shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100/70 rounded-xl p-1.5 transition-all"
                      tabIndex={-1}
                      title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full py-4 rounded-2xl bg-zinc-600 hover:bg-zinc-700 active:bg-zinc-800 active:scale-[0.985] text-white font-bold text-[11px] sm:text-xs uppercase tracking-[0.2em] shadow-lg shadow-zinc-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Lock size={15} strokeWidth={2.2} />
                      <span>Masuk ke Akun</span>
                    </>
                  )}
                </button>
              </form>

              {/* Auxiliary Option */}
              <div className="pt-2 border-t border-zinc-100/90 relative z-10">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("forgot_password");
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Lupa kata sandi?
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* --- VIEW 3: Forgot Password Options --- */}
        {authMode === "forgot_password" && selectedUser && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("enter_password");
                  setErrorMessage("");
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
              >
                <ArrowLeft size={16} />
                <span>Kembali ke Login</span>
              </button>
              <span className="text-[10px] font-mono text-zinc-400">@{selectedUser}</span>
            </div>

            <div className="liquid-glass p-8 rounded-[3rem] space-y-6 shadow-2xl border-white/80 text-left relative overflow-hidden">
              <div className="glass-noise" />
              
              <div className="text-center space-y-1 relative z-10">
                <h2 className="text-2xl font-serif text-zinc-900">Pemulihan Akun</h2>
                <p className="text-xs text-zinc-500">Pilih salah satu metode pemulihan yang aman</p>
              </div>

              {/* Method A: Recovery Code */}
              <div className="p-5 rounded-2xl bg-white/80 border border-zinc-200/80 space-y-4 relative z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900/5 text-zinc-900 flex items-center justify-center">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Gunakan Recovery Code</h3>
                    <p className="text-[11px] text-zinc-500">Gunakan kode darurat yang tersimpan saat pendaftaran</p>
                  </div>
                </div>

                <form onSubmit={handleResetWithCode} className="space-y-3 pt-2">
                  <div>
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Recovery Code</label>
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="ACTA-XXXX-XXXX"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-mono tracking-wider text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Password Baru (min 6 karakter)</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Password baru..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Konfirmasi Password Baru</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi password baru..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !recoveryCode || !newPassword}
                    className="w-full py-3 rounded-xl bg-zinc-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Reset dengan Recovery Code"}
                  </button>
                </form>
              </div>

              {/* Method B: Partner Approval */}
              <div className="p-5 rounded-2xl bg-white/80 border border-zinc-200/80 space-y-3 relative z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-deep-pink/10 text-deep-pink flex items-center justify-center">
                    <HeartHandshake size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Persetujuan Pasangan</h3>
                    <p className="text-[11px] text-zinc-500">Minta {selectedUser === "Harsya" ? "Ayas" : "Harsya"} untuk mengonfirmasi reset kata sandimu</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestPartnerApproval}
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-deep-pink/10 text-deep-pink hover:bg-deep-pink hover:text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={16} />
                  <span>Kirim Permintaan ke Pasangan</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* --- VIEW 4: Waiting for Partner Approval --- */}
        {authMode === "partner_approval_waiting" && selectedUser && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass p-8 rounded-[3rem] space-y-6 shadow-2xl border-white/80 relative overflow-hidden">
            <div className="glass-noise" />
            <div className="w-16 h-16 rounded-full bg-deep-pink/10 text-deep-pink flex items-center justify-center mx-auto animate-pulse relative z-10">
              <RefreshCw size={28} className="animate-spin" />
            </div>
            <div className="space-y-2 relative z-10">
              <h2 className="text-2xl font-serif text-zinc-900">Menunggu Persetujuan...</h2>
              <p className="text-xs text-zinc-600 leading-relaxed max-w-xs mx-auto">
                Permintaan reset telah dikirim ke <strong>{selectedUser === "Harsya" ? "Ayas" : "Harsya"}</strong>. Saat pasanganmu menyetujui, layar ini akan otomatis terbuka.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPartnerStatusPolling(false);
                setRecoverySecret("");
                setPartnerResetToken("");
                setAuthMode("forgot_password");
              }}
              className="px-6 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 font-bold text-xs uppercase tracking-wider hover:bg-zinc-200 transition-colors relative z-10"
            >
              Batal
            </button>
          </motion.div>
        )}

        {/* --- VIEW 5: Partner Approved -> Set New Password --- */}
        {authMode === "partner_approval_reset" && selectedUser && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass p-8 rounded-[3rem] space-y-6 shadow-2xl border-white/80 text-left relative overflow-hidden">
            <div className="glass-noise" />
            <div className="text-center space-y-1 relative z-10">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-2xl font-serif text-zinc-900">Disetujui Pasangan!</h2>
              <p className="text-xs text-zinc-500">Silakan buat kata sandi baru untuk akunmu</p>
            </div>

            <form onSubmit={handlePartnerResetSubmit} className="space-y-4 relative z-10">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Password Baru</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter..."
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password..."
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !newPassword}
                className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Simpan Password Baru"}
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Copy, X } from "lucide-react";
import { fetchWithAuth, safeParseJson } from "../utils/api";

interface SecuritySettingsModalProps {
  user: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export function SecuritySettingsModal({ user, isOpen, onClose, onSuccessToast }: SecuritySettingsModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<"password" | "recovery_code">("password");

  // Change password states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");

  // Recovery code states
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeError, setCodeError] = useState("");

  if (!isOpen) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setPassError("Mohon isi semua field kata sandi.");
      return;
    }
    if (newPassword.length < 6) {
      setPassError("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("Konfirmasi password baru tidak cocok.");
      return;
    }

    setIsChangingPass(true);
    setPassError("");
    setPassSuccess("");

    try {
      const res = await fetchWithAuth("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setPassError(parseResult.error || "Gagal mengubah kata sandi.");
        return;
      }

      setPassSuccess("Kata sandi berhasil diperbarui!");
      if (onSuccessToast) onSuccessToast("Kata sandi berhasil diperbarui!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPassError("Terjadi kesalahan jaringan.");
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleGenerateRecoveryCode = async () => {
    setIsGeneratingCode(true);
    setCodeError("");
    setCodeCopied(false);

    try {
      const res = await fetchWithAuth("/api/auth/generate-recovery-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setCodeError(parseResult.error || "Gagal membuat recovery code.");
        return;
      }

      setGeneratedCode(parseResult.data.recoveryCode);
      if (onSuccessToast) onSuccessToast("Recovery Code baru berhasil dibuat!");
    } catch (err) {
      setCodeError("Terjadi kesalahan jaringan.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 sm:p-6"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="liquid-glass w-full max-w-md p-6 sm:p-8 rounded-[3rem] space-y-6 shadow-2xl border-white/80 relative overflow-hidden"
        >
          <div className="glass-noise" />

          {/* Header */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-zinc-900/5 flex items-center justify-center text-zinc-900">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-zinc-900">Keamanan Akun</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">@{user}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sub-tabs */}
          <div className="flex bg-zinc-100/80 p-1 rounded-2xl relative z-10">
            <button
              type="button"
              onClick={() => setActiveSubTab("password")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === "password" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              Ubah Password
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("recovery_code")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === "recovery_code" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              Recovery Code
            </button>
          </div>

          {/* --- TAB 1: UBAH PASSWORD --- */}
          {activeSubTab === "password" && (
            <form onSubmit={handleChangePassword} className="space-y-4 relative z-10 text-left">
              {passError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{passError}</span>
                </div>
              )}
              {passSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Password Saat Ini</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Masukkan password saat ini..."
                    className="w-full bg-white/80 border border-zinc-200 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Password Baru (min 6 karakter)</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Password baru..."
                    className="w-full bg-white/80 border border-zinc-200 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Ulangi password baru..."
                  className="w-full bg-white/80 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <button
                type="submit"
                disabled={isChangingPass || !currentPassword || !newPassword}
                className="w-full py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {isChangingPass ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Simpan Password Baru"}
              </button>
            </form>
          )}

          {/* --- TAB 2: RECOVERY CODE --- */}
          {activeSubTab === "recovery_code" && (
            <div className="space-y-4 relative z-10 text-left">
              {codeError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{codeError}</span>
                </div>
              )}

              <p className="text-xs text-zinc-600 leading-relaxed">
                Recovery Code digunakan saat kamu lupa kata sandi dan ingin mereset akun secara instan tanpa approval pasangan.
              </p>

              {generatedCode ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Recovery Code Baru:</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">Satu Kali Pakai</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-amber-300 font-mono text-sm tracking-wider font-black text-zinc-900 text-center select-all">
                    {generatedCode}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {codeCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    <span>{codeCopied ? "Berhasil Disalin!" : "Salin Recovery Code"}</span>
                  </button>
                  <p className="text-[10px] text-amber-700 italic text-center">
                    Simpan kode ini di tempat aman (Catatan/Password Manager). Kode lama otomatis hangus.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <KeyRound size={20} className="text-zinc-500" />
                    <div>
                      <p className="text-xs font-bold text-zinc-800">Perbarui Recovery Code Darurat</p>
                      <p className="text-[11px] text-zinc-500">Membuat kode baru akan menggantikan kode sebelumnya.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRecoveryCode}
                    disabled={isGeneratingCode}
                    className="w-full py-3 rounded-xl bg-zinc-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                  >
                    {isGeneratingCode ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Buat Recovery Code Baru"}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

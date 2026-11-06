import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert, Check, X, Lock } from "lucide-react";
import { fetchWithAuth, safeParseJson } from "../utils/api";

interface PartnerApprovalDialogProps {
  request: {
    targetUsername: string;
    requestId: number;
    requestedAt: string;
  } | null;
  onClose: () => void;
  onActionComplete: (msg: string) => void;
}

export function PartnerApprovalDialog({ request, onClose, onActionComplete }: PartnerApprovalDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  if (!request) return null;

  const handleApprove = async () => {
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetchWithAuth("/api/auth/recovery/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.requestId }),
      });
      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setError(parseResult.error || "Gagal menyetujui reset.");
        return;
      }
      onActionComplete(`Kamu telah menyetujui permintaan reset password ${request.targetUsername}.`);
      onClose();
    } catch (e) {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setError("");
    try {
      const res = await fetchWithAuth("/api/auth/recovery/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.requestId }),
      });
      const parseResult = await safeParseJson(res);
      if (!parseResult.success || !parseResult.data?.success) {
        setError(parseResult.error || "Gagal menolak reset.");
        return;
      }
      onActionComplete(`Kamu menolak permintaan reset password.`);
      onClose();
    } catch (e) {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 sm:p-6"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="liquid-glass w-full max-w-sm p-6 sm:p-8 rounded-[3rem] space-y-6 shadow-2xl border-white/80 text-center relative overflow-hidden"
        >
          <div className="glass-noise" />

          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner relative z-10">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-2 relative z-10">
            <h3 className="font-serif text-xl font-bold text-zinc-900">Permintaan Reset Password</h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Pasanganmu (<strong>{request.targetUsername}</strong>) meminta izin untuk mereset kata sandi akunnya karena lupa password.
            </p>
            <p className="text-[11px] text-zinc-400 italic">Apakah ini benar pasanganmu?</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs relative z-10">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 relative z-10">
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="py-3 px-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
            >
              <X size={16} />
              <span>Tolak</span>
            </button>
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className="py-3 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-lg"
            >
              {isProcessing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                <>
                  <Check size={16} />
                  <span>Setujui</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

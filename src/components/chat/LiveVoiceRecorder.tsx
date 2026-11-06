import React, { useState, useEffect, useRef } from "react";
import { Mic, Pause, Play, Trash2, Send, AlertCircle } from "lucide-react";

interface LiveVoiceRecorderProps {
  onCancel: () => void;
  onSendAudio: (blob: Blob, mimeType: string, durationSecs: number) => Promise<void>;
  onError: (errorMessage: string) => void;
}

export const LiveVoiceRecorder: React.FC<LiveVoiceRecorderProps> = ({
  onCancel,
  onSendAudio,
  onError,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waveAmplitudes, setWaveAmplitudes] = useState<number[]>([15, 25, 40, 20, 30, 50, 25, 35, 20, 45, 30, 20]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>("");
  const durationRef = useRef<number>(0);

  // Pick best available MIME type for recording
  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === "undefined") return "";
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/wav",
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  };

  useEffect(() => {
    let isCancelled = false;

    async function initRecorder() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          onError("Browser kamu tidak mendukung perekaman audio langsung.");
          onCancel();
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Set up Web Audio Analyser for authentic live waveform
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateWaveform = () => {
              if (!analyserRef.current || isPaused) {
                animFrameRef.current = requestAnimationFrame(updateWaveform);
                return;
              }
              analyserRef.current.getByteFrequencyData(dataArray);
              
              // Sample 12 frequency bins
              const sampled: number[] = [];
              const step = Math.max(1, Math.floor(dataArray.length / 12));
              for (let i = 0; i < 12; i++) {
                const val = dataArray[i * step] || 0;
                // Scale to 15% - 100%
                const scaled = Math.min(100, Math.max(15, Math.round((val / 255) * 100)));
                sampled.push(scaled);
              }
              setWaveAmplitudes(sampled);
              animFrameRef.current = requestAnimationFrame(updateWaveform);
            };
            animFrameRef.current = requestAnimationFrame(updateWaveform);
          }
        } catch (audioErr) {
          console.warn("Analyser setup error, falling back to simulated pulse:", audioErr);
        }

        const mime = getSupportedMimeType();
        mimeTypeRef.current = mime;
        const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
        const mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.start(150);

        // Start duration counter
        timerRef.current = setInterval(() => {
          setDuration((prev) => {
            const next = prev + 1;
            durationRef.current = next;
            return next;
          });
        }, 1000);
      } catch (err: any) {
        console.error("Microphone access error:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          onError("Izin mikrofon diperlukan. Mohon izinkan akses mikrofon di browser.");
        } else {
          onError("Gagal mengakses mikrofon: " + (err.message || "Periksa pengaturan perangkat"));
        }
        onCancel();
      }
    }

    initRecorder();

    return () => {
      isCancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleTogglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);
    }
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    onCancel();
  };

  const handleSend = async () => {
    if (isSubmitting || !mediaRecorderRef.current) return;
    setIsSubmitting(true);

    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    
    // Stop recording and wait for final blob
    const finishPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || mimeTypeRef.current || "audio/webm";
        const finalBlob = new Blob(audioChunksRef.current, { type: mime });
        resolve(finalBlob);
      };
      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        const mime = recorder.mimeType || mimeTypeRef.current || "audio/webm";
        const finalBlob = new Blob(audioChunksRef.current, { type: mime });
        resolve(finalBlob);
      }
    });

    try {
      const finalBlob = await finishPromise;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (finalBlob.size < 100 && duration < 1) {
        onError("Durasi pesan suara terlalu singkat.");
        onCancel();
        return;
      }

      await onSendAudio(finalBlob, recorder.mimeType || mimeTypeRef.current || "audio/webm", durationRef.current || duration);
    } catch (err: any) {
      onError("Gagal mengirim rekaman suara: " + (err.message || "Kesalahan jaringan"));
      onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      id="live-voice-recorder-bar"
      className="flex items-center justify-between gap-2.5 w-full py-1 px-1 select-none animate-fadeIn"
    >
      {/* Delete / Cancel Button */}
      <button
        id="btn-cancel-recording"
        onClick={handleCancel}
        disabled={isSubmitting}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 transition-all shrink-0 active:scale-95 border border-rose-500/20"
        title="Batal & Hapus Rekaman"
      >
        <Trash2 size={16} />
      </button>

      {/* Recording Status & Waveform Center */}
      <div className="flex-1 flex items-center justify-center gap-3 px-3 py-1.5 rounded-xl bg-white/40 border border-white/60 min-w-0">
        {/* Pulsing indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPaused ? "bg-amber-500" : "bg-rose-500 animate-pulse"
            }`}
          />
          <span className="text-xs font-mono font-semibold text-zinc-900">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Live Audio Waveform Bars */}
        <div className="flex items-center gap-[3px] h-6 flex-1 justify-center max-w-[140px]">
          {waveAmplitudes.map((amp, idx) => (
            <div
              key={`live-bar-${idx}`}
              style={{
                height: isPaused ? "20%" : `${Math.max(15, amp)}%`,
              }}
              className={`w-[3px] rounded-full transition-all duration-75 ${
                isPaused ? "bg-amber-400/60" : "bg-rose-500"
              }`}
            />
          ))}
        </div>

        {/* Pause / Resume Button */}
        <button
          id="btn-pause-resume-recording"
          onClick={handleTogglePause}
          disabled={isSubmitting}
          className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all shrink-0 ${
            isPaused
              ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border border-amber-500/30"
              : "bg-zinc-900/10 text-zinc-700 hover:bg-zinc-900/15"
          }`}
          title={isPaused ? "Lanjutkan Rekaman" : "Jeda Rekaman"}
        >
          {isPaused ? <Play size={11} className="fill-current" /> : <Pause size={11} className="fill-current" />}
          <span className="hidden sm:inline">{isPaused ? "Lanjut" : "Jeda"}</span>
        </button>
      </div>

      {/* Send Recording Button */}
      <button
        id="btn-send-recording"
        onClick={handleSend}
        disabled={isSubmitting}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/25 transition-all shrink-0 active:scale-95"
        title="Kirim Pesan Suara"
      >
        {isSubmitting ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Send size={15} />
        )}
      </button>
    </div>
  );
};

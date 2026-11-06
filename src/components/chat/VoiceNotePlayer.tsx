import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface VoiceNotePlayerProps {
  url: string;
  isUser: boolean;
  activePlayingUrl: string | null;
  onTogglePlay: (url: string) => void;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  url,
  isUser,
  activePlayingUrl,
  onTogglePlay,
}) => {
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isCurrentPlaying = activePlayingUrl === url;

  // Generate deterministic bar heights from url string
  const bars = React.useMemo(() => {
    const list: number[] = [];
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = (hash << 5) - hash + url.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < 22; i++) {
      const pseudo = Math.abs(Math.sin((hash + i * 17) * 0.25));
      const height = Math.round(20 + pseudo * 70); // 20% to 90%
      list.push(height);
    }
    return list;
  }, [url]);

  useEffect(() => {
    const audio = new Audio(url);
    audio.preload = "metadata";
    audioRef.current = audio;

    const onLoaded = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setCurrentTime(0);
      onTogglePlay(""); // stops global state
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url]);

  // Synchronize playback with global activePlayingUrl
  useEffect(() => {
    if (!audioRef.current) return;
    if (isCurrentPlaying) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Audio play error:", err);
        }
        onTogglePlay("");
      });
    } else {
      audioRef.current.pause();
    }
  }, [isCurrentPlaying, playbackRate]);

  const handleSeek = (index: number) => {
    if (!audioRef.current || !duration) return;
    const targetTime = (index / bars.length) * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    if (!isCurrentPlaying) {
      onTogglePlay(url);
    }
  };

  const handleRateChange = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const currentBarIndex = Math.floor(progress * bars.length);

  return (
    <div
      id={`voice-note-${encodeURIComponent(url.slice(-10))}`}
      className="flex items-center gap-2.5 py-1 min-w-[210px] sm:min-w-[240px] select-none"
    >
      {/* Play/Pause Action Button */}
      <button
        id="btn-play-voice-note"
        onClick={() => onTogglePlay(url)}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs transition-all duration-200 active:scale-95 ${
          isCurrentPlaying
            ? isUser
              ? "bg-white text-zinc-900 shadow-md"
              : "bg-rose-500 text-white shadow-md shadow-rose-500/20"
            : isUser
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-zinc-900/10 hover:bg-zinc-900/15 text-zinc-800"
        }`}
        title={isCurrentPlaying ? "Jeda" : "Putar Pesan Suara"}
      >
        {isCurrentPlaying ? (
          <Pause size={15} className="fill-current" />
        ) : (
          <Play size={15} className="fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Timer */}
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        {/* Interactive Waveform Bars */}
        <div
          className="flex items-center gap-[2.5px] h-6 cursor-pointer py-1"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, clickX / rect.width));
            if (audioRef.current && duration) {
              const target = ratio * duration;
              audioRef.current.currentTime = target;
              setCurrentTime(target);
              if (!isCurrentPlaying) onTogglePlay(url);
            }
          }}
        >
          {bars.map((h, i) => {
            const isPlayed = i <= currentBarIndex && (isCurrentPlaying || currentTime > 0);
            return (
              <div
                key={`bar-${i}`}
                style={{ height: `${Math.max(18, h)}%` }}
                className={`w-[3px] rounded-full transition-all duration-100 ${
                  isPlayed
                    ? isUser
                      ? "bg-white"
                      : "bg-rose-500"
                    : isUser
                    ? "bg-white/35 hover:bg-white/60"
                    : "bg-zinc-900/20 hover:bg-zinc-900/40"
                } ${isCurrentPlaying && i === currentBarIndex ? "scale-y-125" : ""}`}
              />
            );
          })}
        </div>

        {/* Time and Speed Controls */}
        <div className="flex items-center justify-between text-[10px] font-mono leading-none opacity-80">
          <span>{formatTime(isCurrentPlaying || currentTime > 0 ? currentTime : duration)}</span>
          
          <button
            id="btn-voice-speed"
            onClick={handleRateChange}
            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all ${
              isUser
                ? "bg-white/20 hover:bg-white/30 text-white"
                : "bg-zinc-900/10 hover:bg-zinc-900/15 text-zinc-700"
            }`}
            title="Kecepatan Putar"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

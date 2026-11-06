import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { requestNotificationPermission, onMessageListener } from "./firebase";
import { fetchWithAuth, AUTH_TOKEN, getSessionToken, clearSessionToken, setSessionToken, safeParseJson } from "./utils/api";
import { AuthScreen } from "./components/AuthScreen";
import { SecuritySettingsModal } from "./components/SecuritySettingsModal";
import { PartnerApprovalDialog } from "./components/PartnerApprovalDialog";
import { VoiceNotePlayer } from "./components/chat/VoiceNotePlayer";
import { LiveVoiceRecorder } from "./components/chat/LiveVoiceRecorder";
import { FileAttachmentBubble } from "./components/chat/FileAttachmentBubble";
import { AttachmentPreviewBar, PendingAttachment } from "./components/chat/AttachmentPreviewBar";
import { 
  MessageCircle, 
  Calendar, 
  Image as ImageIcon, 
  Lock, 
  Home as HomeIcon,
  Send,
  Plus,
  Sparkles,
  ChevronRight,
  Camera,
  Share,
  Music as MusicIcon,
  Heart,
  User as UserIcon,
  Settings as SettingsIcon,
  Edit2,
  Save,
  LogOut,
  Trash2,
  RotateCcw,
  Youtube,
  Play,
  Pause,
  AlertCircle,
  Wifi,
  WifiOff,
  CheckCircle2,
  Check,
  XCircle,
  Mic,
  Phone,
  Video,
  PhoneOff,
  Volume2,
  VolumeX,
  Palette,
  SunMoon,
  Clock,
  KeyRound,
  ShieldCheck,
  History,
  Link2,
  FileText,
  Search,
  ExternalLink,
  Info,
  Paperclip,
  Download
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { playCuteSound } from "./utils/sound";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-soft-pink text-center">
          <div className="glass-card p-10 max-w-sm space-y-6">
            <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto text-red-500">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-zinc-900">Aduh, Ada Masalah!</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">Aplikasi lagi ngambek nih sayang. Coba refresh ya? 🥺</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Refresh Sekarang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Toast System ---
interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) => (
  <div className="fixed top-6 right-6 z-[200] space-y-3 pointer-events-none">
    <AnimatePresence>
      {toasts.map((t) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, x: 50, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8, x: 20 }}
          className={cn(
            "pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl min-w-[240px]",
            t.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" :
            t.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-600" :
            "bg-zinc-900/10 border-zinc-900/20 text-zinc-900"
          )}
        >
          {t.type === "success" && <CheckCircle2 size={18} />}
          {t.type === "error" && <XCircle size={18} />}
          {t.type === "info" && <Sparkles size={18} />}
          <span className="text-[11px] font-black uppercase tracking-widest">{t.message}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

// --- Types ---
interface Photo {
  id: number;
  url: string;
  caption: string;
  sender: string;
  timestamp: string;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
  timestamp?: string;
}

interface UserProfile {
  username: string;
  nickname: string;
  profilePic: string | null;
  bio: string | null;
  mood?: string;
  mood_timestamp?: string;
  focus?: string;
  focus_timestamp?: string;
}

interface BucketItem {
  id: number;
  title: string;
  completed: number;
  sender: string;
  timestamp: string;
}

interface Coupon {
  id: number;
  title: string;
  description: string;
  claimed: number;
  claimed_by: string | null;
  timestamp: string;
}

interface RegularMessage {
  id?: number;
  uuid: string;
  sender: string;
  text: string | null;
  voiceUrl: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  seen: number;
  status: 'sent' | 'delivered' | 'read';
  timestamp: string;
  isOptimistic?: boolean;
}

export interface IncomingCallPayload {
  from: "Harsya" | "Ayas";
  offer: RTCSessionDescriptionInit;
  callType: 'voice' | 'video';
}

export interface CallAcceptedPayload {
  from: "Harsya" | "Ayas";
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
}

export interface CallFailedPayload {
  reason: "offline" | "busy" | string;
}

// --- Utils ---
function getEmojiHex(emoji: string) {
  const codes = [];
  for (const char of emoji) {
    const code = char.codePointAt(0);
    if (code) {
      const hex = code.toString(16);
      if (hex !== "fe0f") codes.push(hex);
    }
  }
  return codes.join("-");
}

const EMOJI_REGEX = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;

const EmojiText = ({ text, className }: { text: string; className?: string }) => {
  const parts = text.split(EMOJI_REGEX);
  
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (EMOJI_REGEX.test(part)) {
          const hex = getEmojiHex(part);
          return (
            <img
              key={i}
              src={`https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-64/${hex}.png`}
              alt={part}
              className="inline-block w-[1.2em] h-[1.2em] mx-[0.05em] align-text-bottom"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          );
        }
        return part;
      })}
    </span>
  );
};

function MoodTracker({ user, profiles, onUpdate }: { user: string; profiles: UserProfile[]; onUpdate: (mood: string) => void }) {
  const moods = [
    { emoji: "😊", label: "Happy", color: "bg-amber-400", text: "I'm feeling great today!" },
    { emoji: "✨", label: "Grateful", color: "bg-emerald-400", text: "Feeling so lucky today." },
    { emoji: "😴", label: "Sleepy", color: "bg-indigo-400", text: "Need some cozy rest..." },
    { emoji: "🥺", label: "Miss You", color: "bg-sky-400", text: "Counting down the days." },
    { emoji: "😤", label: "Grumpy", color: "bg-orange-400", text: "A bit moody, handle with care!" },
    { emoji: "🤒", label: "Sick", color: "bg-emerald-400", text: "Not feeling too well..." }
  ];

  const myProfile = profiles.find(p => p.username === user);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleMoodSelect = (label: string) => {
    setIsUpdating(true);
    playCuteSound("pop");
    onUpdate(label);
    setTimeout(() => setIsUpdating(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-1 px-2">
        <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-[0.3em]">Daily Check-in</h3>
        <h2 className="text-2xl font-serif text-zinc-900 tracking-tight">How are you feeling?</h2>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {moods.map(m => {
          const isActive = myProfile?.mood === m.label;
          return (
            <Haptic key={m.label} scale={0.98} className="w-full">
              <button
                onClick={() => handleMoodSelect(m.label)}
                disabled={isUpdating}
                className={cn(
                  "relative w-full p-4 rounded-[2rem] border-2 transition-all duration-500 flex flex-col items-center text-center gap-2 overflow-hidden group",
                  isActive 
                    ? "bg-white border-zinc-900 shadow-xl" 
                    : "liquid-glass border-transparent hover:border-white/80"
                )}
              >
                <div className="glass-noise" />
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-500 group-hover:scale-110 relative z-10",
                  isActive ? "bg-zinc-900/5" : "bg-zinc-50"
                )}>
                  {m.emoji}
                </div>
                <span className={cn(
                  "text-[8px] font-black uppercase tracking-widest relative z-10",
                  isActive ? "text-zinc-900" : "text-zinc-400"
                )}>{m.label}</span>
              </button>
            </Haptic>
          );
        })}
      </div>
    </div>
  );
}

function BucketList({ user, onAction }: { user: string; onAction: () => void }) {
  const [items, setItems] = useState<BucketItem[]>([]);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    fetchWithAuth("/api/bucket-list").then(res => res.json()).then(setItems);
  }, []);

  const addItem = () => {
    if (!newTitle.trim()) return;
    playCuteSound("pop");
    fetchWithAuth("/api/bucket-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, sender: user })
    }).then(() => {
      setNewTitle("");
      onAction();
    });
  };

  const toggleItem = (id: number) => {
    playCuteSound("bubble");
    fetchWithAuth(`/api/bucket-list/${id}/toggle`, { method: "POST" }).then(onAction);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-[1.5rem] bg-contrast flex items-center justify-center shadow-2xl shadow-zinc-900/10">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-serif text-zinc-900 leading-none">Shared Bucket List</h3>
            <p className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] mt-2">Our dreams and goals together</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Add a new dream..."
            className="w-full liquid-glass py-5 px-6 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all relative z-10"
          />
          <div className="glass-noise" />
        </div>
        <Haptic scale={0.95}>
          <button
            onClick={addItem}
            className="w-16 h-16 bg-contrast rounded-[1.5rem] flex items-center justify-center hover:bg-zinc-800 transition-all shadow-2xl shadow-zinc-900/10"
          >
            <Plus size={28} />
          </button>
        </Haptic>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {items.map(item => (
          <Haptic key={item.id} scale={0.98} className="w-full">
            <div 
              onClick={() => toggleItem(item.id)}
              className={cn(
                "p-6 rounded-[2rem] border transition-all flex items-center gap-6 cursor-pointer group relative overflow-hidden",
                item.completed 
                  ? "bg-emerald-50/20 border-emerald-100/30 opacity-60" 
                  : "liquid-glass border-white/60"
              )}
            >
              <div className="glass-noise" />
              <div className={cn(
                "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 relative z-10",
                item.completed 
                  ? "bg-emerald-500 border-emerald-500 text-white scale-110" 
                  : "border-zinc-200 group-hover:border-zinc-900/40"
              )}>
                {item.completed && <CheckCircle2 size={16} fill="currentColor" />}
              </div>
              <span className={cn(
                "text-sm font-medium transition-all duration-500 tracking-tight relative z-10",
                item.completed ? "text-emerald-800/70 line-through" : "text-zinc-800"
              )}>
                {item.title}
              </span>
            </div>
          </Haptic>
        ))}
      </div>
    </div>
  );
}

function Coupons({ user }: { user: string }) {
  return null;
}

const NavItem = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={() => {
      playCuteSound("bubble");
      onClick();
    }}
    className={cn(
      "flex flex-col items-center justify-center min-w-[56px] h-14 transition-all duration-700 relative group",
      active ? "text-zinc-900" : "text-zinc-300 hover:text-zinc-400"
    )}
  >
    <motion.div
      animate={{ 
        y: active ? -2 : 0,
        scale: active ? 1.15 : 1
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative z-10"
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
    </motion.div>
    
    {active && (
      <motion.div
        layoutId="nav-active"
        className="absolute inset-0 bg-white/50 backdrop-blur-[120px] rounded-full shadow-[0_15px_45px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)] border border-white/90 -z-0"
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <div className="glass-noise rounded-full" />
      </motion.div>
    )}

  </button>
);

// --- Call Overlay ---
function CallOverlay({ 
  isCalling, 
  incomingCall, 
  callAccepted, 
  callType,
  callConnectionState = "idle",
  onAnswer, 
  onEnd, 
  localVideoRef, 
  remoteVideoRef,
  partnerName,
  isConnected
}: { 
  isCalling: boolean; 
  incomingCall: IncomingCallPayload | null; 
  callAccepted: boolean; 
  callType: 'voice' | 'video' | null;
  callConnectionState?: "idle" | "connecting" | "connected" | "disconnected" | "failed";
  onAnswer: () => void; 
  onEnd: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  partnerName: string;
  isConnected: boolean;
}) {
  if (!isCalling && !incomingCall) return null;

  const currentCallType = incomingCall?.callType || callType;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-zinc-900 flex flex-col items-center justify-center p-6"
    >
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-deep-pink/20 to-transparent" />
      </div>

      <div className="relative w-full max-w-lg aspect-[9/16] bg-zinc-800 rounded-[3rem] overflow-hidden shadow-3xl border border-white/10">
        {/* Connection Status Indicator */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 backdrop-blur-xl border border-white/10 shadow-xl">
          {callConnectionState === "connected" || (isConnected && callAccepted) ? (
            <>
              <Wifi size={14} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Terhubung</span>
            </>
          ) : callConnectionState === "disconnected" ? (
            <>
              <WifiOff size={14} className="text-amber-400 animate-pulse" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Menyambung Ulang...</span>
            </>
          ) : callConnectionState === "failed" ? (
            <>
              <WifiOff size={14} className="text-red-400" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Koneksi Gagal</span>
            </>
          ) : isConnected ? (
            <>
              <Wifi size={14} className="text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Menghubungkan...</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-red-400" />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Terputus</span>
            </>
          )}
        </div>

        {/* Remote Video */}
        {currentCallType === 'video' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
              <UserIcon size={64} className="text-white/20" />
            </div>
          </div>
        )}
        
        {!callAccepted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-8 bg-zinc-900/60 backdrop-blur-md">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center border border-white/20"
            >
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                {currentCallType === 'video' ? (
                  <Video size={48} className="text-white animate-pulse" />
                ) : (
                  <Phone size={48} className="text-white animate-pulse" />
                )}
              </div>
            </motion.div>
            <div className="text-center space-y-2">
              <h3 className="text-3xl font-serif text-white tracking-tight">
                {incomingCall ? `Panggilan ${currentCallType === 'video' ? 'Video' : 'Suara'} dari ${incomingCall.from}` : `Menghubungi ${partnerName}...`}
              </h3>
              <p className="text-white/60 text-xs uppercase tracking-[0.3em]">
                {incomingCall ? "Ingin bicara sama kamu nih" : "Semoga dia cepet angkat ya"}
              </p>
            </div>
          </div>
        )}

        {/* Local Video (Picture-in-Picture) */}
        {currentCallType === 'video' && (
          <motion.div
            drag
            dragConstraints={{ left: 20, right: 20, top: 20, bottom: 20 }}
            className="absolute top-6 right-6 w-32 aspect-[9/16] bg-zinc-700 rounded-[2rem] overflow-hidden border-2 border-white/20 shadow-2xl z-10 cursor-move"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </motion.div>
        )}

        {/* Controls */}
        <div className="absolute bottom-12 left-0 w-full px-10 flex justify-center gap-8 z-20">
          {incomingCall && !callAccepted ? (
            <>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onAnswer}
                className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/40 border border-white/20"
              >
                <Phone size={32} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onEnd}
                className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-500/40 border border-white/20"
              >
                <PhoneOff size={32} />
              </motion.button>
            </>
          ) : (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onEnd}
              className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-500/40 border border-white/20"
            >
              <PhoneOff size={32} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Haptic Feedback Wrapper ---
const Haptic = ({ children, scale = 0.95, className = "" }: { children: React.ReactNode, scale?: number, className?: string }) => (
  <motion.div
    whileHover={{ scale: 1.02, filter: "blur(0px)" }}
    whileTap={{ scale, filter: "blur(2px)" }}
    transition={{ type: "spring", stiffness: 600, damping: 30 }}
    className={cn("cursor-pointer active:opacity-80 transition-opacity", className)}
  >
    {children}
  </motion.div>
);

// --- Liquid Glass Background ---
const LiquidBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <div className="absolute inset-0 bg-[var(--theme-bg)] transition-colors duration-700" />
    <motion.div 
      animate={{ 
        scale: [1, 1.2, 1],
        rotate: [0, 90, 0],
        x: [0, 100, 0],
        y: [0, 50, 0]
      }}
      transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      className="absolute -top-[20%] -left-[20%] w-[80%] h-[80%] rounded-[40%_60%_70%_30%] liquid-blob-1 blur-[120px] mix-blend-normal transition-colors duration-700" 
    />
    <motion.div 
      animate={{ 
        scale: [1, 1.3, 1],
        rotate: [0, -120, 0],
        x: [0, -150, 0],
        y: [0, -100, 0]
      }}
      transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      className="absolute -bottom-[25%] -right-[25%] w-[90%] h-[90%] rounded-[60%_40%_30%_70%] liquid-blob-2 blur-[150px] mix-blend-normal transition-colors duration-700" 
    />
    <motion.div 
      animate={{ 
        scale: [1, 1.5, 1],
        x: [0, 50, 0],
        y: [0, -50, 0]
      }}
      transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full liquid-blob-3 blur-[100px] mix-blend-normal transition-colors duration-700" 
    />
    <div className="absolute inset-0 backdrop-blur-[60px] opacity-40" />
    <div className="glass-noise opacity-[0.03] absolute inset-0 mix-blend-overlay" />
  </div>
);

export default function App() {
  const [user, setUser] = useState<"Harsya" | "Ayas" | null>(() => {
    return localStorage.getItem("acaya_user") as any;
  });
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "timeline" | "gallery" | "cinema" | "settings" | "profile" | "secrets">("home");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [partnerRecoveryRequest, setPartnerRecoveryRequest] = useState<{ targetUsername: string; requestId: number; requestedAt: string } | null>(null);
  
  // Calling State
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video' | null>(null);
  const [callConnectionState, setCallConnectionState] = useState<"idle" | "connecting" | "connected" | "disconnected" | "failed">("idle");
  const [showCallSelection, setShowCallSelection] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<string>("default");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [regularMessages, setRegularMessages] = useState<RegularMessage[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Session verification on mount
  useEffect(() => {
    const token = getSessionToken();
    if (token) {
      fetchWithAuth("/api/auth/me")
        .then(res => safeParseJson(res))
        .then(result => {
          if (result.success && result.data && result.data.authenticated && result.data.user) {
            setUser(result.data.user.username);
          } else {
            clearSessionToken();
            localStorage.removeItem("acaya_user");
            setUser(null);
          }
        })
        .catch(() => {
          clearSessionToken();
          localStorage.removeItem("acaya_user");
          setUser(null);
        });
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (!audioUnlocked) {
        console.log("App: Audio unlocked via user interaction");
        setAudioUnlocked(true);
        // Play a silent sound to "warm up" the audio context
        const silentAudio = new Audio("https://cdn.pixabay.com/audio/2022/05/27/audio_1808d304b3.mp3");
        silentAudio.volume = 0;
        silentAudio.play().catch(() => {});
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
      }
    };
    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [audioUnlocked]);

  const sendLoveAction = (action: string) => {
    if (!socket || !user) return;
    playCuteSound("sparkle");
    socket.emit("love_action", { sender: user, action });
    addToast(`Sent a ${action} to ${user === "Harsya" ? "Ayas" : "Harsya"}! ✨`, "success");
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem("acaya_user", user);
      fetchWithAuth(`/api/profile/${user}`)
        .then(res => res.json())
        .then(data => setProfile(data));
      
      // Request notification permission
      requestNotificationPermission(user);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onMessageListener((payload: any) => {
      console.log("Foreground message received:", payload);
      if (payload.notification) {
        addToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (socket && isConnected) {
      socket.emit("set_active_room", activeTab);
    }
  }, [activeTab, socket, isConnected]);

  const addToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 3000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setIsConnected(false);
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setIsConnected(false);
      return;
    }

    const newSocket = io({
      auth: {
        token: sessionToken,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setIsConnected(true);
      newSocket.emit("identify", user, (response: any) => {
        if (response && response.status === "ok") {
          setOnlineUsers(response.onlineUsers);
        }
      });
    });
    newSocket.on("disconnect", () => setIsConnected(false));
    newSocket.on("connect_error", () => {
      setIsConnected(false);
      addToast("Gagal terhubung ke server 🥺", "error");
    });

    newSocket.on("online_users", (users: string[]) => {
      setOnlineUsers(users);
    });

    newSocket.on("partner_recovery_requested", (data: { targetUsername: string; requestId: number; requestedAt: string }) => {
      playCuteSound("sparkle");
      setPartnerRecoveryRequest(data);
    });

    fetchWithAuth("/api/messages")
      .then(res => res.json())
      .then(data => setRegularMessages(data));

    fetchWithAuth("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data?.theme) {
          setTheme(data.theme);
          document.documentElement.setAttribute("data-theme", data.theme);
        }
        if (data?.video_url) {
          setVideoUrl(data.video_url);
        }
      });

    fetchWithAuth("/api/profile")
      .then(res => res.json())
      .then(data => setProfiles(data));

    newSocket.on("settings_updated", (data: { theme: string }) => {
      setTheme(data.theme);
      document.documentElement.setAttribute("data-theme", data.theme);
    });

    newSocket.on("new_message", (msg: RegularMessage) => {
      setRegularMessages(prev => {
        // Prevent duplicate messages if they have a UUID
        if (msg.uuid && prev.some(m => m.uuid === msg.uuid)) {
          return prev;
        }
        return [...prev, msg];
      });

      // If we are the recipient, mark as read
      if (msg.sender !== user) {
        newSocket.emit("message_read", { uuid: msg.uuid });
      }
    });

    newSocket.on("message_status_update", (data: { uuid?: string, recipient?: string, status: 'delivered' | 'read' }) => {
      setRegularMessages(prev => prev.map(m => {
        if (data.uuid && m.uuid === data.uuid) {
          return { ...m, status: data.status, seen: data.status === 'read' ? 1 : m.seen };
        }
        if (data.recipient && m.sender !== data.recipient) {
          // If recipient is the one who updated status, it means messages we sent to them are updated
          return { ...m, status: data.status, seen: data.status === 'read' ? 1 : m.seen };
        }
        return m;
      }));
    });

    newSocket.on("message_reaction_updated", (data: { message_id: number, reactions: any[] }) => {
      setRegularMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, reactions: data.reactions } : m));
    });

    newSocket.on("message_deleted", (data: { id: number }) => {
      setRegularMessages(prev => prev.filter(m => m.id !== data.id));
    });

    newSocket.on("video_updated", (data: { video_url: string }) => {
      setVideoUrl(data.video_url);
    });

    newSocket.on("mood_updated", (data: { username: string, mood: string, timestamp: string }) => {
      setProfiles(prev => prev.map(p => p.username === data.username ? { ...p, mood: data.mood, mood_timestamp: data.timestamp } : p));
      if (data.username === user) {
        setProfile(prev => prev ? { ...prev, mood: data.mood, mood_timestamp: data.timestamp } : null);
      } else {
        playCuteSound("sparkle");
      }
    });

    newSocket.on("focus_updated", (data: { username: string, focus: string, timestamp: string }) => {
      setProfiles(prev => prev.map(p => p.username === data.username ? { ...p, focus: data.focus, focus_timestamp: data.timestamp } : p));
      if (data.username === user) {
        setProfile(prev => prev ? { ...prev, focus: data.focus, focus_timestamp: data.timestamp } : null);
      } else {
        playCuteSound("bubble");
      }
    });

    newSocket.on("incoming_call", (data: IncomingCallPayload) => {
      if (isCalling || callAccepted) {
        newSocket.emit("call_failed", { to: data.from, reason: "busy" });
        return;
      }
      setIncomingCall(data);
      playCuteSound("bubble");
    });

    newSocket.on("call_accepted", async (data: CallAcceptedPayload) => {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      setCallAccepted(true);
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          await processQueuedCandidates(peerConnection.current);
        } catch (e) {
          console.error("Error setting remote description on call_accepted:", e);
        }
      }
    });

    newSocket.on("ice_candidate", async (data: IceCandidatePayload) => {
      if (!data?.candidate) return;
      const pc = peerConnection.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding ice candidate:", e);
        }
      } else {
        iceCandidateQueue.current.push(data.candidate);
      }
    });

    newSocket.on("call_failed", (data: CallFailedPayload) => {
      handleEndCallLocally();
      if (data?.reason === "offline") {
        addToast("Pasanganmu sedang offline 🥺", "info");
      } else if (data?.reason === "busy") {
        addToast("Pasanganmu sedang dalam panggilan lain 📞", "info");
      } else {
        addToast("Panggilan gagal terhubung 🥺", "error");
      }
    });

    newSocket.on("call_ended", () => {
      handleEndCallLocally();
      addToast("Panggilan telah berakhir 🎀", "info");
    });

    newSocket.on("messages_seen", (data: { seenBy: string }) => {
      if (data.seenBy !== user) {
        setRegularMessages(prev => prev.map(m => m.sender === user ? { ...m, seen: 1 } : m));
      }
    });

    newSocket.on("user_typing", (data: { username: string }) => {
      if (data.username !== user) setIsPartnerTyping(true);
    });

    newSocket.on("user_stop_typing", (data: { username: string }) => {
      if (data.username !== user) setIsPartnerTyping(false);
    });

    newSocket.on("receive_love_action", (data: { sender: string, action: string }) => {
      playCuteSound("sparkle");
      addToast(`${data.sender} sent you a ${data.action}! ❤️`, "success");
    });

    return () => {
      newSocket.close();
    };
  }, [user]); // Removed chatType to avoid socket reconnects during active calls

  const handleMoodUpdate = (mood: string) => {
    if (!user) return;
    
    // Optimistic update
    const now = new Date().toISOString();
    setProfiles(prev => prev.map(p => p.username === user ? { ...p, mood, mood_timestamp: now } : p));
    setProfile(prev => prev ? { ...prev, mood, mood_timestamp: now } : null);

    // Update via socket for real-time
    if (socket) {
      socket.emit("update_mood", { username: user, mood });
    }

    // Still call API to ensure persistence and consistency
    fetchWithAuth(`/api/profile/${user}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood })
    });
  };

  const handleFocusUpdate = (focus: string) => {
    if (!user) return;
    
    // Optimistic update
    const now = new Date().toISOString();
    setProfiles(prev => prev.map(p => p.username === user ? { ...p, focus, focus_timestamp: now } : p));
    setProfile(prev => prev ? { ...prev, focus, focus_timestamp: now } : null);

    // Update via socket for real-time
    if (socket) {
      socket.emit("update_focus", { username: user, focus });
    }

    // Still call API to ensure persistence and consistency
    fetchWithAuth(`/api/profile/${user}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focus })
    });
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    fetchWithAuth("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: newTheme }),
    });
  };

  const getIceServers = (): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
    ];
    const turnUrl = (import.meta as any).env?.VITE_TURN_URL;
    const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME;
    const turnCredential = (import.meta as any).env?.VITE_TURN_CREDENTIAL;
    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }
    return servers;
  };

  const getMediaConstraints = (type: 'voice' | 'video'): MediaStreamConstraints => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: type === 'video' ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: "user",
    } : false,
  });

  const processQueuedCandidates = async (pc: RTCPeerConnection) => {
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Failed to add queued ice candidate:", e);
        }
      }
    }
  };

  const setupPeerConnectionListeners = (pc: RTCPeerConnection, targetPartner: string, activeSocket: Socket) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        activeSocket.emit("ice_candidate", {
          to: targetPartner,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log("ICE Connection State:", state);
      if (state === "connected" || state === "completed") {
        setCallConnectionState("connected");
      } else if (state === "disconnected") {
        setCallConnectionState("disconnected");
      } else if (state === "failed") {
        setCallConnectionState("failed");
        try {
          if (pc.restartIce) pc.restartIce();
        } catch (e) {}
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Peer Connection State:", state);
      if (state === "connected") {
        setCallConnectionState("connected");
      } else if (state === "disconnected") {
        setCallConnectionState("disconnected");
      } else if (state === "failed") {
        setCallConnectionState("failed");
      } else if (state === "closed") {
        setCallConnectionState("idle");
      }
    };
  };

  const startCall = async (type: 'voice' | 'video') => {
    if (!socket || !user) return;
    if (isCalling || incomingCall || callAccepted) {
      addToast("Sedang dalam panggilan 📞", "info");
      return;
    }

    const targetPartner = user === "Harsya" ? "Ayas" : "Harsya";
    setIsCalling(true);
    setCallType(type);
    setShowCallSelection(false);
    setCallConnectionState("connecting");
    playCuteSound("pop");

    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      if (!callAccepted) {
        addToast("Tidak ada jawaban dari pasanganmu 🥺", "info");
        endCall();
      }
    }, 40000);

    try {
      const constraints = getMediaConstraints(type);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (mediaErr) {
        console.warn("Retrying with fallback constraints:", mediaErr);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video',
        });
      }

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnection.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      setupPeerConnectionListeners(pc, targetPartner, socket);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call_user", {
        to: targetPartner,
        offer,
        callType: type,
      });
    } catch (err) {
      console.error("Failed to start call:", err);
      handleEndCallLocally();
      addToast("Gagal mengakses kamera/mikrofon 🥺", "error");
    }
  };

  const answerCall = async () => {
    if (!socket || !incomingCall || !user) return;
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    const callTypeToAnswer = incomingCall.callType;
    const targetPartner = incomingCall.from;
    setCallAccepted(true);
    setCallType(callTypeToAnswer);
    setCallConnectionState("connecting");
    playCuteSound("sparkle");

    try {
      const constraints = getMediaConstraints(callTypeToAnswer);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (mediaErr) {
        console.warn("Retrying with fallback constraints:", mediaErr);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callTypeToAnswer === 'video',
        });
      }

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnection.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      setupPeerConnectionListeners(pc, targetPartner, socket);

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      await processQueuedCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer_call", {
        to: targetPartner,
        answer,
      });
      setIncomingCall(null);
    } catch (err) {
      console.error("Failed to answer call:", err);
      handleEndCallLocally();
      addToast("Gagal menjawab panggilan 🥺", "error");
    }
  };

  const endCall = () => {
    if (socket && user) {
      const targetPartner = user === "Harsya" ? "Ayas" : "Harsya";
      socket.emit("end_call", { to: targetPartner });
    }
    handleEndCallLocally();
    playCuteSound("bubble");
  };

  const handleEndCallLocally = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    iceCandidateQueue.current = [];

    setIsCalling(false);
    setIncomingCall(null);
    setCallAccepted(false);
    setCallType(null);
    setCallConnectionState("idle");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (peerConnection.current) {
      try {
        peerConnection.current.ontrack = null;
        peerConnection.current.onicecandidate = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.close();
      } catch (e) {
        console.error("Error closing peer connection:", e);
      }
      peerConnection.current = null;
    }
  };

  useEffect(() => {
    (window as any).startCall = startCall;
    (window as any).answerCall = answerCall;
    (window as any).endCall = endCall;
  }, [socket, user, incomingCall, localStream]);

  return (
    <ErrorBoundary>
      <LiquidBackground />
      <div className={cn(
        "relative transition-all duration-700 bg-transparent flex flex-col",
        activeTab === "chat" ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      )}>
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <AnimatePresence>
          {showCallSelection && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[400] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl space-y-8 text-center"
              >
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif text-zinc-900">Pilih Tipe Panggilan</h3>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Mau denger suara atau liat muka? ✨</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => startCall('voice')}
                    className="flex flex-col items-center gap-4 p-6 rounded-3xl bg-zinc-50 hover:bg-zinc-100 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-emerald-500 transition-colors">
                      <Phone size={28} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-zinc-900">Suara</span>
                  </button>

                  <button
                    onClick={() => startCall('video')}
                    className="flex flex-col items-center gap-4 p-6 rounded-3xl bg-zinc-50 hover:bg-zinc-100 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-deep-pink transition-colors">
                      <Video size={28} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-zinc-900">Video</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowCallSelection(false)}
                  className="w-full py-4 rounded-2xl bg-zinc-100 text-zinc-400 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                >
                  Batal
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!user ? (
            <AuthScreen
              profiles={profiles}
              onLoginSuccess={(selectedUser) => {
                playCuteSound("sparkle");
                setUser(selectedUser);
              }}
            />
          ) : (
            <>
              {activeTab === "home" && (
      <div className="fixed top-6 left-6 z-50 flex items-center gap-3 glass-bubble p-1.5 pr-5 border border-white/40 shadow-sm cursor-pointer hover:bg-white/80 transition-all group" onClick={() => { playCuteSound("bubble"); setActiveTab("profile"); }}>
        <div className="relative">
          {profile?.profilePic ? (
            <img src={profile.profilePic} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-zinc-100 shadow-sm" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-100 shadow-sm">
              <UserIcon size={16} />
            </div>
          )}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm",
            isConnected ? "bg-emerald-500" : "bg-zinc-300"
          )} />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-black text-zinc-800 uppercase tracking-[0.15em] leading-none">{profile?.nickname || user}</span>
          <span className={cn(
            "text-[7px] font-bold uppercase tracking-[0.1em] mt-1",
            isConnected ? "text-emerald-500" : "text-zinc-400"
          )}>{isConnected ? "Online" : "Offline"}</span>
        </div>
      </div>
            )}

            <CallOverlay 
              isCalling={isCalling}
              incomingCall={incomingCall}
              callAccepted={callAccepted}
              callType={callType}
              callConnectionState={callConnectionState}
              onAnswer={answerCall}
              onEnd={endCall}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              partnerName={user === "Harsya" ? "Ayas" : "Harsya"}
              isConnected={isConnected}
            />

            <main className={cn(
              "mx-auto relative z-10 transition-all duration-500 w-full flex-1",
              activeTab === "chat" 
                ? "max-w-2xl px-3 sm:px-4 pt-2.5 sm:pt-4 pb-20 sm:pb-22 min-h-0 flex flex-col overflow-hidden" 
                : activeTab === "home" 
                ? "max-w-md px-4 pt-20 sm:pt-22 pb-24" 
                : "max-w-md px-4 pt-8 sm:pt-10 pb-24"
            )}>
              <AnimatePresence mode="wait">
                {activeTab === "home" && (
                  <Home 
                    key="home" 
                    user={user} 
                    profile={profile} 
                    profiles={profiles} 
                    socket={socket}
                    onAction={() => {}} 
                    onMoodUpdate={handleMoodUpdate} 
                    onFocusUpdate={handleFocusUpdate}
                    setActiveTab={setActiveTab} 
                    onLoveAction={sendLoveAction}
                    onlineUsers={onlineUsers}
                  />
                )}
                {activeTab === "chat" && (
                  <Chat 
                    key="chat" 
                    user={user} 
                    profile={profile}
                    partner={profiles.find(p => p.username !== user) || null}
                    regularMessages={regularMessages} 
                    setRegularMessages={setRegularMessages} 
                    onAction={() => {}} 
                    socket={socket} 
                    activeTab={activeTab} 
                    isPartnerTyping={isPartnerTyping} 
                    setIsPartnerTyping={setIsPartnerTyping} 
                    onCall={() => setShowCallSelection(true)} 
                    onlineUsers={onlineUsers} 
                    addToast={addToast} 
                  />
                )}
                {activeTab === "timeline" && <Timeline key="timeline" onAction={() => {}} />}
                {activeTab === "gallery" && <Gallery key="gallery" user={user} socket={socket} onAction={() => {}} />}
                {activeTab === "cinema" && <Cinema key="cinema" user={user} videoUrl={videoUrl} onAction={() => {}} />}
                {activeTab === "settings" && (
                  <SettingsView 
                    key="settings" 
                    user={user} 
                    currentTheme={theme} 
                    onThemeChange={handleThemeChange} 
                    onOpenSecurity={() => setShowSecurityModal(true)} 
                  />
                )}
                {activeTab === "profile" && (
                  <Profile 
                    key="profile" 
                    user={user} 
                    profile={profile} 
                    partner={profiles.find(p => p.username !== user) || null}
                    onUpdate={setProfile} 
                    onSwitch={async () => {
                      playCuteSound("bubble");
                      try {
                        await fetchWithAuth("/api/auth/logout", { method: "POST" });
                      } catch (e) {}
                      if (socket) {
                        socket.disconnect();
                      }
                      clearSessionToken();
                      localStorage.removeItem("acaya_user");
                      setSocket(null);
                      setIsConnected(false);
                      setUser(null);
                    }} 
                  />
                )}
              </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-[95%] sm:w-[92%] max-w-lg liquid-glass-intense p-1.5 flex justify-around items-center z-50 shadow-3xl border-white/90 backdrop-blur-[100px] overflow-x-auto scrollbar-hide rounded-full">
              <div className="glass-noise" />
              <NavItem icon={HomeIcon} label="Home" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
              <NavItem icon={MessageCircle} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} />
              <NavItem icon={Calendar} label="Memories" active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")} />
              <NavItem icon={ImageIcon} label="Gallery" active={activeTab === "gallery"} onClick={() => setActiveTab("gallery")} />
              <NavItem icon={Youtube} label="Cinema" active={activeTab === "cinema"} onClick={() => setActiveTab("cinema")} />
              <NavItem icon={SettingsIcon} label="Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
            </nav>
          </>
        )}
      </AnimatePresence>

      {showSecurityModal && user && (
        <SecuritySettingsModal
          user={user}
          isOpen={showSecurityModal}
          onClose={() => setShowSecurityModal(false)}
          onSuccessToast={(msg) => addToast(msg, "success")}
        />
      )}

      {partnerRecoveryRequest && (
        <PartnerApprovalDialog
          request={partnerRecoveryRequest}
          onClose={() => setPartnerRecoveryRequest(null)}
          onActionComplete={(msg) => addToast(msg, "success")}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

function Profile({ 
  user, 
  profile, 
  partner,
  onUpdate, 
  onSwitch
}: { 
  user: string; 
  profile: UserProfile | null; 
  partner: UserProfile | null;
  onUpdate: (p: UserProfile) => void; 
  onSwitch: () => void; 
}) {
  const [nickname, setNickname] = useState(profile?.nickname || user);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [time, setTime] = useState(new Date());

  const PRESET_AVATARS = [
    `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/adventurer/svg?seed=Milo&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/adventurer/svg?seed=Zoe&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/lorelei/svg?seed=Luna&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/lorelei/svg?seed=Oliver&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/lorelei/svg?seed=Willow&backgroundColor=b6e3f4,c0aede,d1d4f9`,
    `https://api.dicebear.com/7.x/lorelei/svg?seed=Jasper&backgroundColor=b6e3f4,c0aede,d1d4f9`,
  ];

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname);
    }
  }, [profile]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`/api/profile/${user}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, bio: profile?.bio || "", profilePic: profile?.profilePic }),
      });
      const data = await res.json();
      onUpdate(data);
      playCuteSound("sparkle");
    } catch (error) {
      console.error("Failed to save profile:", error);
    }
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleAvatarSelect = async (url: string) => {
    if (!isEditing) return;
    playCuteSound("pop");
    const res = await fetchWithAuth(`/api/profile/${user}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, bio: profile?.bio || "", profilePic: url }),
    });
    const data = await res.json();
    onUpdate(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const profilePic = reader.result as string;
        const res = await fetchWithAuth(`/api/profile/${user}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname, bio: profile?.bio || "", profilePic }),
        });
        const data = await res.json();
        onUpdate(data);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="space-y-6 sm:space-y-8 w-full"
    >
      {/* Clock Header */}
      <div className="flex flex-col items-center justify-center py-2 sm:py-4">
        <motion.div 
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="ios-clock text-4xl sm:text-5xl font-serif text-zinc-900 tracking-tight"
        >
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </motion.div>
        <div className="text-zinc-500 font-bold tracking-[0.25em] uppercase text-[10px] sm:text-xs mt-1.5">
          {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* 1. IDENTITY SECTION */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.08}
        className="liquid-glass rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden"
      >
        <div className="glass-noise" />
        <div className="flex flex-col sm:flex-row items-center gap-6 w-full relative z-10 text-center sm:text-left">
          <div className="relative group">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden border-2 border-white/60 shadow-xl ios-inner-shadow scale-100 group-hover:scale-[1.02] transition-transform duration-500 bg-white/20">
              {profile?.profilePic ? (
                <img src={profile.profilePic} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-zinc-100/50 flex items-center justify-center text-zinc-400">
                  <UserIcon size={44} strokeWidth={1.5} />
                </div>
              )}
            </div>
            {isEditing && (
              <label htmlFor="profile-upload" className="absolute -bottom-2 -right-2 bg-white/95 text-zinc-900 w-10 h-10 rounded-xl shadow-xl cursor-pointer flex items-center justify-center border border-white/80 hover:scale-110 transition-transform z-20">
                <Camera size={18} />
                <input type="file" id="profile-upload" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>
            )}
          </div>

          <div className="flex-1 space-y-2 sm:space-y-3">
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.25em]">Identity Profile</div>
            {isEditing ? (
              <input 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="text-2xl sm:text-4xl font-serif text-zinc-900 tracking-tight leading-tight bg-white/40 border border-zinc-200/60 rounded-2xl px-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 w-full text-center sm:text-left"
                placeholder="Nama panggilan..."
              />
            ) : (
              <h3 className="text-2xl sm:text-4xl font-serif text-zinc-900 tracking-tight leading-tight">{nickname}</h3>
            )}
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="px-3 py-1 rounded-full bg-zinc-900/5 border border-zinc-900/5 text-xs font-semibold text-zinc-600">
                @{user}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-zinc-400">Online Space</span>
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="w-full space-y-3 pt-4 border-t border-zinc-200/50 relative z-10">
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider text-left">Pilih Avatar Cepat</div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
              {PRESET_AVATARS.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAvatarSelect(url)}
                  className={cn(
                    "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-2 transition-all flex-shrink-0 overflow-hidden shadow-sm",
                    profile?.profilePic === url ? "border-zinc-900 scale-105 shadow-md" : "border-white/50 opacity-70 hover:opacity-100"
                  )}
                >
                  <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={`Avatar ${idx}`} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 relative z-10">
          <Haptic scale={0.98}>
            <button 
              onClick={() => isEditing ? handleSave() : setIsEditing(true)}
              disabled={isSaving}
              className={cn(
                "w-full h-14 rounded-2xl font-bold text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all duration-300 shadow-md relative overflow-hidden",
                isEditing ? "bg-zinc-900 text-white" : "bg-white/70 hover:bg-white text-zinc-800 border border-white/80"
              )}
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isEditing ? (
                <>
                  <Save size={18} />
                  <span>Simpan Perubahan</span>
                </>
              ) : (
                <>
                  <Edit2 size={18} />
                  <span>Edit Profil & Avatar</span>
                </>
              )}
            </button>
          </Haptic>
        </div>
      </motion.div>

      {/* 2. PARTNER CONNECTION CARD */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.08}
        className="liquid-glass rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 space-y-4 shadow-2xl relative overflow-hidden"
      >
        <div className="glass-noise" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-inner">
              <Heart size={18} fill="currentColor" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-900 tracking-tight">Connected Partner</h4>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">Beloved Soulmate</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-3 py-1 rounded-full">
            Linked
          </span>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/40 border border-white/60 relative z-10">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/80 shadow-md bg-white/40 flex-shrink-0">
            {partner?.profilePic ? (
              <img src={partner.profilePic} alt={partner.nickname || "Partner"} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400">
                <UserIcon size={24} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-base font-serif text-zinc-900 font-medium truncate">{partner?.nickname || (user === "Harsya" ? "Ayas" : "Harsya")}</h5>
            <p className="text-xs text-zinc-400 font-medium">@{user === "Harsya" ? "Ayas" : "Harsya"}</p>
          </div>
        </div>
      </motion.div>

      {/* 3. LOGOUT / SWITCH ACCOUNT */}
      <div className="pt-2">
        <Haptic scale={0.98}>
          <button
            onClick={onSwitch}
            className="w-full h-14 rounded-2xl bg-rose-50/60 hover:bg-rose-100/80 text-rose-600 font-bold text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 border border-rose-200/50 shadow-md transition-all"
          >
            <LogOut size={18} />
            <span>Switch Account / Keluar</span>
          </button>
        </Haptic>
      </div>
    </motion.div>
  );
}

function SettingsView({
  user,
  currentTheme,
  onThemeChange,
  onOpenSecurity
}: {
  user: string;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  onOpenSecurity: () => void;
}) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem("acaya_sound") !== "false";
  });

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("acaya_sound", String(next));
    if (next) {
      playCuteSound("pop");
    }
  };

  const THEMES = [
    {
      id: 'default',
      name: 'Original Light',
      desc: 'Ivory Soft Pink',
      accent: '#f43f5e',
      swatch: 'linear-gradient(135deg, #fff1f2 0%, #fdfcfb 60%, #fce7f3 100%)',
    },
    {
      id: 'dark',
      name: 'Midnight Dark',
      desc: 'Deep Charcoal',
      accent: '#a855f7',
      swatch: 'linear-gradient(135deg, #1f1f23 0%, #09090b 60%, #27272a 100%)',
      isDark: true,
    },
    {
      id: 'romantic',
      name: 'Rose Petal',
      desc: 'Soft Blossom',
      accent: '#e11d48',
      swatch: 'linear-gradient(135deg, #ffe4e6 0%, #fafaf9 60%, #fecdd3 100%)',
    },
    {
      id: 'ocean',
      name: 'Ocean Breeze',
      desc: 'Serene Blue',
      accent: '#0284c7',
      swatch: 'linear-gradient(135deg, #e0f2fe 0%, #f8fafc 60%, #bae6fd 100%)',
    },
    {
      id: 'sunset',
      name: 'Golden Sunset',
      desc: 'Warm Amber',
      accent: '#d97706',
      swatch: 'linear-gradient(135deg, #fef3c7 0%, #fffcf0 60%, #fed7aa 100%)',
    },
    {
      id: 'lavender',
      name: 'Lilac Dream',
      desc: 'Pastel Purple',
      accent: '#7c3aed',
      swatch: 'linear-gradient(135deg, #f3e8ff 0%, #fafafa 60%, #ddd6fe 100%)',
    },
    {
      id: 'emerald',
      name: 'Forest Emerald',
      desc: 'Gentle Green',
      accent: '#059669',
      swatch: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 60%, #a7f3d0 100%)',
    },
  ];

  const currentThemeObj = THEMES.find(t => t.id === currentTheme) || THEMES[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="space-y-6 sm:space-y-7 w-full pb-28 sm:pb-32"
    >
      {/* Header */}
      <div className="flex flex-col items-center justify-center py-2 sm:py-3 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/40 dark:bg-white/10 border border-white/60 dark:border-white/15 shadow-xs mb-2 backdrop-blur-md"
        >
          <Sparkles size={11} className="text-zinc-500 dark:text-zinc-400" />
          <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.25em]">Preferences</span>
        </motion.div>
        <h2 className="text-3xl sm:text-4xl font-serif text-zinc-900 tracking-tight">Settings</h2>
        <p className="text-xs text-zinc-400 font-serif italic mt-1">"Personalize your intimate space experience."</p>
      </div>

      {/* 1. APPEARANCE & THEME SECTION (Apple-inspired Floating Liquid Glass) */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.06}
        className="liquid-glass rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden"
      >
        <div className="glass-noise" />
        
        {/* Section Header */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 flex items-center justify-center shadow-2xs backdrop-blur-md">
              <SunMoon size={16} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-[-0.01em] leading-tight">
                Appearance & Theme
              </h3>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-400 font-normal tracking-normal mt-0.5">
                Aesthetic Space Palette
              </p>
            </div>
          </div>
          
          {/* Current Selection Minimal Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08] backdrop-blur-md">
            <span 
              className="w-1.5 h-1.5 rounded-full shadow-xs"
              style={{ backgroundColor: currentThemeObj.accent }}
            />
            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 tracking-tight">
              {currentThemeObj.name}
            </span>
          </div>
        </div>

        {/* Floating Liquid Glass Theme Selections */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 relative z-10 pt-1">
          {THEMES.map((t) => {
            const isActive = currentTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  playCuteSound("pop");
                  onThemeChange(t.id);
                }}
                className={cn(
                  "relative inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl transition-all duration-200 group text-left cursor-pointer focus:outline-none",
                  isActive
                    ? "bg-white/80 dark:bg-white/20 border border-white/90 dark:border-white/25 shadow-sm shadow-zinc-900/5 ring-1 ring-black/5 dark:ring-white/15"
                    : "bg-white/40 dark:bg-white/[0.04] border border-white/60 dark:border-white/[0.08] hover:bg-white/65 dark:hover:bg-white/[0.09]"
                )}
              >
                {/* Floating Micro Swatch */}
                <div 
                  className={cn(
                    "relative w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border shadow-xs transition-transform duration-200 group-hover:scale-105",
                    t.isDark ? "border-white/20" : "border-black/10"
                  )}
                  style={{ background: t.swatch }}
                >
                  <div 
                    className="w-1.5 h-1.5 rounded-full shadow-xs" 
                    style={{ backgroundColor: t.accent }} 
                  />
                </div>

                {/* Theme Name */}
                <span className={cn(
                  "text-xs sm:text-[13px] tracking-tight transition-colors",
                  isActive 
                    ? "font-semibold text-zinc-900 dark:text-white" 
                    : "font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white"
                )}>
                  {t.name}
                </span>

                {/* Active Soft Indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeThemeCheck"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 450, damping: 25 }}
                    className="w-4 h-4 rounded-full bg-zinc-900/90 dark:bg-white/90 text-white dark:text-zinc-900 flex items-center justify-center ml-0.5 shadow-xs"
                  >
                    <Check size={9} strokeWidth={3} />
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* 2. APP EXPERIENCE */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.06}
        className="liquid-glass rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 space-y-4 shadow-2xl relative overflow-hidden"
      >
        <div className="glass-noise" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 dark:bg-amber-400/20 text-amber-600 dark:text-amber-300 flex items-center justify-center shadow-xs border border-amber-500/20">
            <Volume2 size={18} strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 tracking-tight leading-tight">App Experience</h4>
            <p className="text-[10px] text-zinc-400 font-normal">Audio & Interaction Settings</p>
          </div>
        </div>

        <div className="rounded-2xl sm:rounded-3xl bg-white/30 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 backdrop-blur-xl overflow-hidden divide-y divide-white/40 dark:divide-white/[0.06] relative z-10 shadow-xs">
          {/* Sound Toggle */}
          <div className="flex items-center justify-between p-3.5 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/50 dark:bg-white/10 flex items-center justify-center shadow-xs">
                {soundEnabled ? (
                  <Volume2 size={15} className="text-zinc-700 dark:text-zinc-300" />
                ) : (
                  <VolumeX size={15} className="text-zinc-400" />
                )}
              </div>
              <div>
                <div className="text-xs sm:text-sm font-medium text-zinc-900 leading-tight">Sound Effects & Haptics</div>
                <div className="text-[10px] text-zinc-400 font-normal mt-0.5">Efek suara manis saat navigasi dan interaksi</div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={cn(
                "w-11 h-6.5 rounded-full transition-colors duration-300 relative p-0.5 flex items-center shadow-inner focus:outline-none",
                soundEnabled ? "bg-zinc-900 dark:bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
              )}
            >
              <motion.div 
                animate={{ x: soundEnabled ? 18 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="w-5 h-5 rounded-full bg-white shadow-md"
              />
            </button>
          </div>

          {/* Cloud Sync Status */}
          <div className="flex items-center justify-between p-3.5 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shadow-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-medium text-zinc-900 leading-tight">Real-time Couple Sync</div>
                <div className="text-[10px] text-zinc-400 font-normal mt-0.5">Data tersinkron otomatis antar perangkat</div>
              </div>
            </div>
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              Aktif
            </span>
          </div>
        </div>
      </motion.div>

      {/* 3. SECURITY & PRIVACY */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.06}
        className="liquid-glass rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 space-y-4 shadow-2xl relative overflow-hidden"
      >
        <div className="glass-noise" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 dark:bg-emerald-400/20 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shadow-xs border border-emerald-500/20">
              <ShieldCheck size={18} strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 tracking-tight leading-tight">Security & Privacy</h4>
              <p className="text-[10px] text-zinc-400 font-normal">Couple Account Protection</p>
            </div>
          </div>
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100/60 dark:bg-white/10 px-2.5 py-1 rounded-full border border-white/60 dark:border-white/10">
            E2E Protected
          </span>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed relative z-10">
          Ruang percakapan, memori, dan konten eksklusif kamu dan pasangan dilindungi dengan autentikasi berpasangan dan kode pemulihan terenkripsi.
        </p>

        <div className="pt-1 relative z-10">
          <Haptic scale={0.98}>
            <button
              onClick={onOpenSecurity}
              className="w-full h-12 rounded-2xl bg-white/70 dark:bg-white/15 hover:bg-white dark:hover:bg-white/25 text-zinc-900 font-semibold text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 border border-white/80 dark:border-white/20 shadow-xs transition-all"
            >
              <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span>Kelola Keamanan & Sandi</span>
            </button>
          </Haptic>
        </div>
      </motion.div>

      {/* 4. ABOUT SPACE FOOTER */}
      <div className="text-center space-y-1 pt-1">
        <p className="text-[11px] font-serif italic text-zinc-400 dark:text-zinc-500">Together Since 10 November 2025 • Forever & Always ✨</p>
        <p className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Acaya v2.6 • Liquid Glass Edition</p>
      </div>
    </motion.div>
  );
}

function UserSelection({ profiles, onSelect }: { profiles: UserProfile[]; onSelect: (user: "Harsya" | "Ayas") => void }) {
  const getProfile = (username: string) => profiles.find(p => p.username === username);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-soft-pink/90 backdrop-blur-xl p-6"
    >
      <div className="w-full max-w-sm space-y-12 text-center">
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block px-5 py-2 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm mb-2"
          >
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Welcome Back</span>
          </motion.div>
          <h1 className="text-5xl font-serif text-zinc-900 tracking-tight">Who is here?</h1>
          <p className="text-sm text-zinc-400 font-serif italic">Pilih akun kamu untuk melanjutkan</p>
        </div>

      <div className="grid grid-cols-2 gap-8">
        {(["Harsya", "Ayas"] as const).map((username) => {
          const p = getProfile(username);
          return (
            <Haptic key={username} scale={0.98}>
              <button
                onClick={() => {
                  playCuteSound("sparkle");
                  onSelect(username);
                }}
                className="liquid-glass p-8 flex flex-col items-center gap-6 group hover:border-white/80 transition-all duration-500 relative overflow-hidden"
              >
                <div className="glass-noise" />
                <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-white/60 flex items-center justify-center text-zinc-300 group-hover:text-deep-pink transition-all duration-500 border border-white/80 group-hover:border-white shadow-xl relative z-10">
                  {p?.profilePic ? (
                    <img src={p.profilePic} alt={username} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={48} fill="currentColor" />
                  )}
                </div>
                <div className="flex flex-col space-y-1 relative z-10">
                  <span className="font-serif text-lg text-zinc-900 tracking-tight">{p?.nickname || username}</span>
                  <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-[0.2em]">@{username}</span>
                  {p?.bio && (
                    <span className="text-[10px] text-zinc-400 font-serif italic line-clamp-1 mt-1">"{p.bio}"</span>
                  )}
                </div>
              </button>
            </Haptic>
          );
        })}
      </div>
      </div>
    </motion.div>
  );
}

// --- Tab Components ---

function DailyChallenge({ user, socket, onAction }: { user: string; socket: Socket | null; onAction: () => void }) {
  const [challenge, setChallenge] = useState<any>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const fetchChallenge = () => {
    fetchWithAuth("/api/daily-challenge").then(res => res.json()).then(setChallenge);
  };

  useEffect(() => {
    fetchChallenge();
    if (socket) {
      socket.on("challenge_updated", (updated: any) => {
        setChallenge(updated);
      });
    }
  }, [socket]);

  const completeChallenge = () => {
    if (isCompleting) return;
    setIsCompleting(true);
    playCuteSound("sparkle");
    fetchWithAuth("/api/daily-challenge/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user })
    }).then(() => {
      setIsCompleting(false);
      onAction();
    });
  };

  if (!challenge) return null;

  const isCompletedByMe = user === "Harsya" ? challenge.completed_by_harsya : challenge.completed_by_ayas;
  const isCompletedByPartner = user === "Harsya" ? challenge.completed_by_ayas : challenge.completed_by_harsya;

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="liquid-glass-intense p-10 space-y-8 border-white/80 shadow-xl relative overflow-hidden group"
    >
      <div className="glass-noise" />
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-deep-pink/5 to-transparent rounded-bl-[6rem] -mr-10 -mt-10 transition-all duration-700 group-hover:scale-110" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-[1.5rem] bg-zinc-900/5 border border-zinc-900/10 flex items-center justify-center text-zinc-900 shadow-inner">
            <Sparkles size={24} />
          </div>
          <div className="flex flex-col space-y-0.5">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-[0.3em]">Daily Mission</span>
            <h4 className="text-lg font-serif text-zinc-900 tracking-tight">Tantangan Hari Ini</h4>
          </div>
        </div>
        <div className="flex -space-x-3">
          <div className={cn(
            "w-10 h-10 rounded-full border-4 border-white flex items-center justify-center text-[10px] font-medium transition-all shadow-sm",
            isCompletedByMe ? "bg-contrast" : "bg-zinc-100 text-zinc-400"
          )} title="You">
            {isCompletedByMe ? <CheckCircle2 size={16} /> : "Me"}
          </div>
          <div className={cn(
            "w-10 h-10 rounded-full border-4 border-white flex items-center justify-center text-[10px] font-medium transition-all shadow-sm",
            isCompletedByPartner ? "bg-contrast" : "bg-zinc-100 text-zinc-400"
          )} title="Partner">
            {isCompletedByPartner ? <CheckCircle2 size={16} /> : "You"}
          </div>
        </div>
      </div>

      <div className="bg-zinc-50/50 p-8 rounded-[2rem] border border-zinc-100 relative z-10">
        <p className="text-base text-zinc-700 leading-relaxed font-serif italic text-center">
          <EmojiText text={challenge.text} />
        </p>
      </div>
      
      <div className="flex items-center justify-center pt-2 relative z-10">
        <button 
          onClick={completeChallenge}
          disabled={!!isCompletedByMe || isCompleting}
          className={cn(
            "w-full py-5 rounded-[1.5rem] font-medium text-[11px] uppercase tracking-[0.3em] transition-all duration-500 shadow-2xl",
            isCompletedByMe 
              ? "bg-zinc-100 text-zinc-400 shadow-none" 
              : isCompleting 
                ? "bg-zinc-50 text-zinc-300 cursor-not-allowed"
                : "bg-contrast hover:bg-zinc-800 shadow-zinc-900/20 active:scale-95"
          )}
        >
          {isCompletedByMe ? "Misi Selesai ✨" : isCompleting ? "Memproses..." : "Selesaikan Misi ✨"}
        </button>
      </div>
    </motion.div>
  );
}


function Home({ 
  user, 
  profile, 
  profiles, 
  socket,
  onAction, 
  onMoodUpdate, 
  onFocusUpdate,
  setActiveTab,
  onLoveAction,
  onlineUsers
}: { 
  user: string; 
  profile: UserProfile | null; 
  profiles: UserProfile[]; 
  socket: Socket | null;
  onAction: () => void; 
  onMoodUpdate: (mood: string) => void; 
  onFocusUpdate: (focus: string) => void;
  setActiveTab: (tab: any) => void;
  onLoveAction: (action: string) => void;
  onlineUsers: string[];
}) {
  const startDate = new Date("2025-11-10");
  const today = new Date();
  
  let years = today.getFullYear() - startDate.getFullYear();
  let months = today.getMonth() - startDate.getMonth();
  let days = today.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffTime = Math.abs(today.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dailyQuotes = [
    "Semangat terus ya hari ini! ✨",
    "Setiap hari adalah kesempatan baru. 🌸",
    "Kamu hebat sudah bertahan sampai sekarang. 🌟",
    "Jangan lupa istirahat yang cukup ya. 🍵",
    "Hal-hal baik akan segera datang. 🌈",
    "Terima kasih sudah selalu ada. ✨",
    "Hari ini pasti menyenangkan! ☀️"
  ];

  const [quoteIndex] = useState(() => Math.floor(Math.random() * dailyQuotes.length));
  const partner = profiles.find(p => p.username !== user);
  const [time, setTime] = useState(new Date());
  const [showFocusPicker, setShowFocusPicker] = useState(false);

  const focusOptions = [
    { label: "Available", icon: "🟢", color: "bg-emerald-500", desc: "Ready for some quality time ✨" },
    { label: "Busy", icon: "🔴", color: "bg-rose-500", desc: "Focusing on something important 🤫" },
    { label: "Sleeping", icon: "😴", color: "bg-indigo-500", desc: "In dreamland right now... 🌙" },
    { label: "Working", icon: "💻", color: "bg-amber-500", desc: "Grinding hard! Be back soon 💼" },
    { label: "Studying", icon: "📚", color: "bg-sky-500", desc: "Learning something new 🧠" },
    { label: "Gaming", icon: "🎮", color: "bg-purple-500", desc: "In the middle of a match! 🕹️" },
    { label: "Eating", icon: "🍽️", color: "bg-orange-500", desc: "Yum yum! Having a meal 🍕" },
    { label: "Driving", icon: "🚗", color: "bg-zinc-500", desc: "On the road, stay safe! 🛣️" },
  ];

  const currentFocus = focusOptions.find(f => f.label === profile?.focus) || focusOptions[0];
  const partnerFocus = focusOptions.find(f => f.label === partner?.focus) || focusOptions[0];

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 w-full"
    >
      {/* Bento Grid Layout (iOS 16 Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
        
        {/* Row 1: Greeting & Time Widget */}
        <div className="col-span-2 sm:col-span-4 glass-card p-6 sm:p-8 flex flex-col justify-between min-h-[180px] sm:min-h-[220px]">
          <div className="glass-noise" />
          <div className="space-y-1 relative z-10">
            <h3 className="text-[8px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Welcome back</h3>
            <h2 className="text-3xl sm:text-5xl font-serif text-zinc-900 tracking-tighter leading-[0.9]">
              {profile?.nickname || user}
            </h2>
            <div className="pt-2 sm:pt-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[8px] sm:text-[10px] text-emerald-600/70 font-black uppercase tracking-widest leading-none">
                {onlineUsers.includes(user === "Harsya" ? "Ayas" : "Harsya") ? "Together with Love" : "Connected Spirits"}
              </p>
            </div>
          </div>
          <div className="relative z-10 pt-4">
            <p className="text-xs sm:text-sm text-zinc-500 font-medium italic max-w-[200px] leading-snug">
              <EmojiText text={dailyQuotes[quoteIndex]} />
            </p>
          </div>
        </div>

        <div 
          className="col-span-2 sm:col-span-2 glass-card p-4 flex sm:flex-col items-center justify-center gap-4 sm:gap-1 overflow-hidden"
        >
          <div className="glass-noise" />
          <div className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tighter relative z-10">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 relative z-10">
            {time.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}
          </div>
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="mt-0 sm:mt-4 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-zinc-900/5 flex items-center justify-center text-zinc-400 border border-white/40 shadow-inner relative z-10"
          >
            <Clock size={18} strokeWidth={1} />
          </motion.div>
        </div>

        {/* Row 2: Partner & Mood Widgets */}
        <div className="col-span-1 sm:col-span-3 glass-card p-4 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 text-center group">
          <div className="glass-noise" />
          <div className="relative z-10">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden border-[3px] sm:border-4 border-white shadow-2xl transition-all duration-700 group-hover:scale-105 group-hover:-rotate-3">
              {partner?.profilePic ? (
                <img src={partner.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-zinc-50 flex items-center justify-center text-zinc-300">
                  <UserIcon size={24} />
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-7 h-7 sm:w-9 sm:h-9 bg-white rounded-full flex items-center justify-center shadow-xl text-lg sm:text-xl border-2 border-zinc-50 animate-bounce-subtle overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={partner?.mood || 'none'}
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <EmojiText text={partner?.mood ? (partner.mood === "Happy" ? "😊" : partner.mood === "Grateful" ? "✨" : partner.mood === "Sleepy" ? "😴" : partner.mood === "Miss You" ? "🥺" : partner.mood === "Grumpy" ? "😤" : "🤒") : "😊"} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="space-y-1 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Beloved</p>
            <p className="text-base font-serif text-zinc-900 leading-none">{partner?.nickname || 'Partner'}</p>
          </div>
        </div>

        <Haptic scale={0.97} className="col-span-1 sm:col-span-3">
          <div 
            onClick={() => playCuteSound("pop")}
            className="w-full h-full glass-card p-4 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 text-center cursor-pointer group"
          >
            <div className="glass-noise" />
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1.8rem] sm:rounded-[2.2rem] bg-zinc-900/5 flex items-center justify-center text-3xl sm:text-4xl group-hover:scale-110 transition-transform shadow-inner relative z-10 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={profile?.mood || 'none'}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <EmojiText text={profile?.mood ? (profile.mood === "Happy" ? "😊" : profile.mood === "Grateful" ? "✨" : profile.mood === "Sleepy" ? "😴" : profile.mood === "Miss You" ? "🥺" : profile.mood === "Grumpy" ? "😤" : "🤒") : "😊"} />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="space-y-1 relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Mood</p>
              <p className="text-sm sm:text-base font-serif text-zinc-900 leading-none">{profile?.mood || 'Happy'}</p>
            </div>
          </div>
        </Haptic>

        {/* Row 3: Days Together */}
        <div className="col-span-2 sm:col-span-6 glass-card p-6 sm:p-10 relative overflow-hidden group cursor-pointer" onClick={() => playCuteSound("bubble")}>
          <div className="glass-noise" />
          <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-[0.03] group-hover:opacity-[0.1] transition-all duration-1000 group-hover:scale-150 rotate-12 group-hover:rotate-0">
            <Heart size={160} fill="currentColor" />
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-6 sm:gap-0 relative z-10">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-400">Together Since</p>
              <div className="flex items-baseline justify-center sm:justify-start gap-2">
                <span className="text-5xl sm:text-7xl font-serif text-zinc-900 tracking-tighter leading-none">{diffDays}</span>
                <span className="text-sm sm:text-base font-serif text-zinc-400 italic">days</span>
              </div>
            </div>
            <div className="flex gap-4 sm:gap-8 text-center bg-white/20 p-4 sm:p-6 rounded-[2rem] sm:rounded-[2.5rem] backdrop-blur-md w-full sm:w-auto justify-center">
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-serif text-zinc-900 leading-none">{years}</p>
                <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-zinc-400">Yrs</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-serif text-zinc-900 leading-none">{months}</p>
                <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-zinc-400">Mth</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-serif text-zinc-900 leading-none">{days}</p>
                <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-zinc-400">Day</p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Love Actions */}
        <div className="col-span-2 sm:col-span-6 glass-card p-4 sm:p-6 flex items-center justify-between sm:justify-around overflow-x-auto scrollbar-hide">
          <div className="glass-noise" />
          {[
            { label: "Kiss", emoji: "💋", color: "bg-rose-50" },
            { label: "Hug", emoji: "🫂", color: "bg-sky-50" },
            { label: "Poke", emoji: "👉", color: "bg-amber-50" },
            { label: "Miss", emoji: "🥺", color: "bg-purple-50" },
            { label: "Call", emoji: "🤙", color: "bg-emerald-50" }
          ].map((act) => (
            <Haptic key={act.label} scale={0.88}>
              <button onClick={() => act.label === "Call" ? (window as any).startCall('voice') : onLoveAction(act.label)} className="flex flex-col items-center gap-2 group relative z-10 shrink-0 min-w-[60px]">
                <div className={cn("w-12 h-12 sm:w-14 sm:h-14 rounded-[1.2rem] sm:rounded-[1.5rem] flex items-center justify-center text-xl sm:text-2xl transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg shadow-inner", act.color)}>
                  {act.emoji}
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">{act.label}</span>
              </button>
            </Haptic>
          ))}
        </div>

      </div>

      {/* Mood Picker (Relocated here for better flow) */}
      <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] p-8 border border-white/40 shadow-xl shadow-black/[0.03]">
        <MoodTracker user={user} profiles={profiles} onUpdate={onMoodUpdate} />
      </div>
    </motion.div>
  );
}

function Chat({ 
  user, 
  profile,
  partner,
  regularMessages, 
  setRegularMessages, 
  onAction, 
  socket, 
  activeTab, 
  isPartnerTyping, 
  setIsPartnerTyping, 
  onCall, 
  onlineUsers, 
  addToast 
}: { 
  user: string; 
  profile: UserProfile | null;
  partner: UserProfile | null;
  regularMessages: RegularMessage[];
  setRegularMessages: React.Dispatch<React.SetStateAction<RegularMessage[]>>;
  onAction: () => void;
  socket: Socket | null;
  activeTab: string;
  isPartnerTyping: boolean;
  setIsPartnerTyping: React.Dispatch<React.SetStateAction<boolean>>;
  onCall: () => void;
  onlineUsers: string[];
  addToast: (message: string, type: "success" | "error" | "info") => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<"chat" | "attachments">("chat");
  const [attachmentCategory, setAttachmentCategory] = useState<"media" | "links" | "docs">("media");
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [activePlayingUrl, setActivePlayingUrl] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingEmitRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const partnerName = user === "Harsya" ? "Ayas" : "Harsya";
  const partnerDisplayName = partner?.nickname || partnerName;
  const isPartnerOnline = onlineUsers.includes(partnerName);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        if (socket && user) {
          socket.emit("stop_typing", { username: user });
        }
      }
    };
  }, [socket, user]);

  useEffect(() => {
    if (activeSubTab === "chat") {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [regularMessages, activeSubTab]);

  useEffect(() => {
    if (user && socket) {
      socket.emit("mark_read", { username: user });
    }
  }, [regularMessages.length, user, socket]);

  useEffect(() => {
    if (!socket || !user) return;

    if (input.trim() && !isTypingEmitRef.current) {
      socket.emit("typing", { username: user });
      isTypingEmitRef.current = true;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingEmitRef.current) {
        socket.emit("stop_typing", { username: user });
        isTypingEmitRef.current = false;
      }
    }, 3000);
  }, [input, socket, user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      addToast("Ukuran file maksimal adalah 25MB", "error");
      e.target.value = "";
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const previewUrl = isImage || isVideo ? URL.createObjectURL(file) : undefined;

    setPendingAttachment({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      isImage,
      isVideo,
    });

    playCuteSound("pop");
    e.target.value = "";
  };

  const handleSendVoiceAudio = async (blob: Blob, mimeType: string, durationSecs: number) => {
    setIsLoading(true);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
      const formData = new FormData();
      formData.append("file", blob, `voice-${Date.now()}.${ext}`);

      const uploadRes = await fetchWithAuth("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload error (${uploadRes.status})`);
      }

      const resData = await uploadRes.json();
      const url = resData.url;

      if (!url) throw new Error("URL rekaman tidak ditemukan");

      if (socket) {
        const uuid = crypto.randomUUID();
        const optimisticMsg: RegularMessage = {
          uuid,
          sender: user,
          text: null,
          voiceUrl: url,
          attachmentType: mimeType,
          seen: 0,
          status: "sent",
          timestamp: new Date().toISOString(),
          isOptimistic: true,
        };
        setRegularMessages((prev) => [...prev, optimisticMsg]);

        socket.emit(
          "send_message",
          {
            sender: user,
            voiceUrl: url,
            uuid,
            attachmentType: mimeType,
          },
          (ack: any) => {
            if (ack && ack.status === "error") {
              addToast("Gagal mengirim pesan suara: " + ack.message, "error");
              setRegularMessages((prev) => prev.filter((m) => m.uuid !== uuid));
            } else if (ack && ack.message) {
              setRegularMessages((prev) => prev.map((m) => (m.uuid === uuid ? ack.message : m)));
            }
          }
        );
      }
      setIsVoiceRecording(false);
      playCuteSound("pop");
      onAction();
    } catch (err: any) {
      addToast("Gagal mengunggah pesan suara: " + (err.message || "Kesalahan jaringan"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachment) || isLoading) return;
    if (!socket) return;

    playCuteSound("pop");
    setIsLoading(true);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;
    let attachmentSize: number | null = null;

    if (pendingAttachment) {
      try {
        const formData = new FormData();
        formData.append("file", pendingAttachment.file, pendingAttachment.name);

        const uploadRes = await fetchWithAuth("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error("Gagal mengunggah berkas");
        }

        const resData = await uploadRes.json();
        attachmentUrl = resData.url;
        attachmentName = resData.originalName || pendingAttachment.name;
        attachmentType = resData.mimetype || pendingAttachment.type;
        attachmentSize = resData.size || pendingAttachment.size;
      } catch (err: any) {
        addToast("Gagal mengirim lampiran: " + (err.message || "Gagal upload"), "error");
        setIsLoading(false);
        return;
      }
    }

    const text = input.trim() || null;
    const uuid = crypto.randomUUID();
    setInput("");
    setPendingAttachment(null);

    // Clear typing indicator on send
    socket.emit("stop_typing", { username: user });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingEmitRef.current = false;

    // Optimistic update
    const optimisticMsg: RegularMessage = {
      uuid,
      sender: user,
      text,
      voiceUrl: null,
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
      seen: 0,
      status: "sent",
      timestamp: new Date().toISOString(),
      isOptimistic: true,
    };
    setRegularMessages((prev) => [...prev, optimisticMsg]);

    socket.emit(
      "send_message",
      {
        sender: user,
        text,
        uuid,
        attachmentUrl,
        attachmentName,
        attachmentType,
        attachmentSize,
      },
      (ack: any) => {
        if (ack && ack.status === "error") {
          addToast("Gagal mengirim pesan: " + ack.message, "error");
          setRegularMessages((prev) => prev.filter((m) => m.uuid !== uuid));
        } else if (ack && ack.message) {
          setRegularMessages((prev) => prev.map((m) => (m.uuid === uuid ? ack.message : m)));
        }
      }
    );

    setIsLoading(false);
    onAction();
  };

  // Categorized attachments extracted directly from personal chat
  const mediaAttachments = React.useMemo(() => {
    const items: {
      id: string;
      type: "voice" | "image" | "video";
      url: string;
      sender: string;
      timestamp: string;
      name: string;
    }[] = [];

    regularMessages.forEach((m, idx) => {
      if (m.voiceUrl) {
        items.push({
          id: `voice-${m.id || m.uuid || idx}`,
          type: "voice",
          url: m.voiceUrl,
          sender: m.sender,
          timestamp: m.timestamp,
          name: "Pesan Suara",
        });
      }

      if (m.attachmentUrl) {
        const lowerType = (m.attachmentType || "").toLowerCase();
        const lowerUrl = m.attachmentUrl.toLowerCase();
        const isImg = lowerType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(lowerUrl);
        const isVid = lowerType.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(lowerUrl);
        const isAud = lowerType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm)(\?.*)?$/i.test(lowerUrl);

        if (isImg) {
          items.push({
            id: `att-img-${m.id || m.uuid || idx}`,
            type: "image",
            url: m.attachmentUrl,
            sender: m.sender,
            timestamp: m.timestamp,
            name: m.attachmentName || "Foto",
          });
        } else if (isVid) {
          items.push({
            id: `att-vid-${m.id || m.uuid || idx}`,
            type: "video",
            url: m.attachmentUrl,
            sender: m.sender,
            timestamp: m.timestamp,
            name: m.attachmentName || "Video",
          });
        } else if (isAud && !m.voiceUrl) {
          items.push({
            id: `att-aud-${m.id || m.uuid || idx}`,
            type: "voice",
            url: m.attachmentUrl,
            sender: m.sender,
            timestamp: m.timestamp,
            name: m.attachmentName || "Audio",
          });
        }
      }

      if (m.text) {
        const urls: string[] = m.text.match(/(https?:\/\/[^\s]+)/gi) || [];
        urls.forEach((url: string, uIdx: number) => {
          const lower = url.toLowerCase();
          const isImg = /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(lower) || lower.includes("/uploads/img-") || lower.includes("/uploads/photo-");
          const isVid = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(lower) || lower.includes("/uploads/video-");
          if (isImg) {
            items.push({
              id: `img-${m.id || m.uuid || idx}-${uIdx}`,
              type: "image",
              url,
              sender: m.sender,
              timestamp: m.timestamp,
              name: "Foto",
            });
          } else if (isVid) {
            items.push({
              id: `vid-${m.id || m.uuid || idx}-${uIdx}`,
              type: "video",
              url,
              sender: m.sender,
              timestamp: m.timestamp,
              name: "Video",
            });
          }
        });
      }
    });
    return items;
  }, [regularMessages]);

  const linkAttachments = React.useMemo(() => {
    const items: {
      id: string;
      url: string;
      sender: string;
      timestamp: string;
      contextText: string;
    }[] = [];

    regularMessages.forEach((m, idx) => {
      if (!m.text) return;
      const urls: string[] = m.text.match(/(https?:\/\/[^\s]+)/gi) || [];
      urls.forEach((url: string, uIdx: number) => {
        const lower = url.toLowerCase();
        const isDoc = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)(\?.*)?$/i.test(lower);
        const isMedia = /\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov)(\?.*)?$/i.test(lower);
        if (!isDoc && !isMedia) {
          items.push({
            id: `link-${m.id || m.uuid || idx}-${uIdx}`,
            url,
            sender: m.sender,
            timestamp: m.timestamp,
            contextText: m.text || "",
          });
        }
      });
    });
    return items;
  }, [regularMessages]);

  const docAttachments = React.useMemo(() => {
    const items: {
      id: string;
      url: string;
      name: string;
      ext: string;
      sender: string;
      timestamp: string;
    }[] = [];

    regularMessages.forEach((m, idx) => {
      if (m.attachmentUrl) {
        const lowerType = (m.attachmentType || "").toLowerCase();
        const lowerUrl = m.attachmentUrl.toLowerCase();
        const isImg = lowerType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(lowerUrl);
        const isVid = lowerType.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(lowerUrl);
        const isAud = lowerType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm)(\?.*)?$/i.test(lowerUrl);

        if (!isImg && !isVid && !isAud) {
          const rawName = m.attachmentName || m.attachmentUrl.split("/").pop()?.split("?")[0] || "Dokumen";
          const ext = rawName.includes(".") ? rawName.split(".").pop()?.toUpperCase() || "DOC" : "DOC";
          items.push({
            id: `att-doc-${m.id || m.uuid || idx}`,
            url: m.attachmentUrl,
            name: decodeURIComponent(rawName),
            ext,
            sender: m.sender,
            timestamp: m.timestamp,
          });
        }
      }

      if (m.text) {
        const urls: string[] = m.text.match(/(https?:\/\/[^\s]+)/gi) || [];
        urls.forEach((url: string, uIdx: number) => {
          const lower = url.toLowerCase();
          const extMatch = lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|tar|7z)(\?.*)?$/i);
          if (extMatch || lower.includes("/uploads/doc-") || lower.includes("/uploads/file-")) {
            const ext = extMatch ? extMatch[1].toUpperCase() : "DOC";
            const rawName = url.split("/").pop()?.split("?")[0] || `Dokumen.${ext.toLowerCase()}`;
            items.push({
              id: `doc-${m.id || m.uuid || idx}-${uIdx}`,
              url,
              name: decodeURIComponent(rawName),
              ext,
              sender: m.sender,
              timestamp: m.timestamp,
            });
          }
        });
      }
    });
    return items;
  }, [regularMessages]);

  const filteredMedia = mediaAttachments.filter((item) => {
    if (!attachmentSearch.trim()) return true;
    const q = attachmentSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.sender.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
  });

  const filteredLinks = linkAttachments.filter((item) => {
    if (!attachmentSearch.trim()) return true;
    const q = attachmentSearch.toLowerCase();
    return item.url.toLowerCase().includes(q) || item.sender.toLowerCase().includes(q);
  });

  const filteredDocs = docAttachments.filter((item) => {
    if (!attachmentSearch.trim()) return true;
    const q = attachmentSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.sender.toLowerCase().includes(q) || item.ext.toLowerCase().includes(q);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col flex-1 min-h-0 w-full select-none overflow-hidden"
    >
      {/* Hidden File Input for Attachments */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 1. Profile Header */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 sm:py-2.5 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-xs shrink-0 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/60 shadow-xs border border-white/80 overflow-hidden p-0.5">
              {partner?.profilePic ? (
                <img
                  src={partner.profilePic}
                  alt={partnerDisplayName}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-400 rounded-full">
                  <UserIcon size={18} />
                </div>
              )}
            </div>
            <div
              className={cn(
                "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white shadow-xs",
                isPartnerOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"
              )}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-zinc-900 leading-tight truncate">
              {partnerDisplayName}
            </h3>
            <span
              className={cn(
                "text-[11px] sm:text-xs font-normal flex items-center gap-1.5 mt-0.5",
                isPartnerOnline ? "text-emerald-600" : "text-zinc-400"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isPartnerOnline ? "bg-emerald-500" : "bg-zinc-300"
                )}
              />
              {isPartnerTyping ? "Sedang mengetik..." : isPartnerOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onCall}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white/60 hover:bg-white/90 border border-white/70 text-zinc-700 transition-all shadow-xs active:scale-95"
            title="Mulai Telepon"
          >
            <Phone size={16} />
          </button>
        </div>
      </div>

      {/* 2. Chat Switcher (Segmented Control) */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-white/30 backdrop-blur-xl border border-white/50 shrink-0 mb-2 shadow-xs">
        <button
          onClick={() => {
            playCuteSound("pop");
            setActiveSubTab("chat");
          }}
          className={cn(
            "py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-2",
            activeSubTab === "chat"
              ? "bg-white text-zinc-900 shadow-xs border border-white/80 font-semibold"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <MessageCircle size={14} />
          <span>Personal Chat</span>
        </button>
        <button
          onClick={() => {
            playCuteSound("pop");
            setActiveSubTab("attachments");
          }}
          className={cn(
            "py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-2",
            activeSubTab === "attachments"
              ? "bg-white text-zinc-900 shadow-xs border border-white/80 font-semibold"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <Paperclip size={14} />
          <span>Lampiran</span>
        </button>
      </div>

      {/* 3. Main Content Area */}
      {activeSubTab === "chat" ? (
        <>
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-2.5 sm:px-3 py-3 rounded-2xl bg-white/20 backdrop-blur-lg border border-white/40 shadow-inner space-y-3 scrollbar-hide flex flex-col">
            {regularMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2.5 my-auto">
                <div className="w-12 h-12 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-zinc-400 shadow-xs">
                  <MessageCircle size={22} />
                </div>
                <p className="text-xs font-medium text-zinc-700">Ruang Obrolan Pasangan</p>
                <p className="text-[11px] text-zinc-400 max-w-xs">
                  Belum ada pesan. Kirim sapaan hangat atau berkas untuk {partnerDisplayName} sekarang ✨
                </p>
              </div>
            ) : (
              regularMessages.map((m, i) => (
                <motion.div
                  key={`reg-msg-${m.id || m.uuid || i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "relative group max-w-[84%] sm:max-w-[76%] px-3.5 sm:px-4 py-2 sm:py-2.5 text-[13px] sm:text-sm leading-relaxed transition-all shadow-xs",
                    m.sender === user
                      ? "self-end ml-auto rounded-2xl rounded-tr-xs liquid-chat-bubble-user"
                      : "self-start mr-auto rounded-2xl rounded-tl-xs liquid-chat-bubble"
                  )}
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    {/* Attachment Bubble */}
                    {m.attachmentUrl && (
                      <FileAttachmentBubble
                        url={m.attachmentUrl}
                        name={m.attachmentName}
                        type={m.attachmentType}
                        size={m.attachmentSize}
                        isUser={m.sender === user}
                      />
                    )}

                    {/* Voice Note Bubble */}
                    {m.voiceUrl && (
                      <VoiceNotePlayer
                        url={m.voiceUrl}
                        isUser={m.sender === user}
                        activePlayingUrl={activePlayingUrl}
                        onTogglePlay={(url) =>
                          setActivePlayingUrl((prev) => (prev === url ? null : url))
                        }
                      />
                    )}

                    {/* Text Message */}
                    {m.text && <p className="font-normal leading-relaxed">{m.text}</p>}
                  </div>

                  {/* Timestamp & Status */}
                  <div className="flex items-center gap-1 justify-end text-[9px] mt-1 opacity-70 select-none text-zinc-400">
                    <span>
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    {m.sender === user && (
                      <div className="flex items-center ml-0.5">
                        {m.status === "read" ? (
                          <div className="flex -space-x-1 text-sky-500">
                            <Check size={10} strokeWidth={3} />
                            <Check size={10} strokeWidth={3} />
                          </div>
                        ) : m.status === "delivered" ? (
                          <div className="flex -space-x-1 text-zinc-400">
                            <Check size={10} strokeWidth={3} />
                            <Check size={10} strokeWidth={3} />
                          </div>
                        ) : (
                          <Check size={10} strokeWidth={3} className="text-zinc-400" />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}

            {isPartnerTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="self-start px-3.5 py-2 rounded-2xl rounded-tl-xs bg-white/70 border border-white/60 text-zinc-500 flex items-center gap-1.5 shadow-xs backdrop-blur-md"
              >
                <span className="text-xs font-medium">{partnerDisplayName} sedang mengetik</span>
                <div className="flex gap-1 ml-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </motion.div>
            )}
            <div ref={scrollRef} className="h-2" />
          </div>

          {/* Bottom Floating Composer Container */}
          <div className="shrink-0 mt-2 flex flex-col">
            {/* Pending Attachment Preview Bar */}
            <AttachmentPreviewBar
              attachment={pendingAttachment}
              onRemove={() => setPendingAttachment(null)}
            />

            {/* Input / Recorder Glass Box */}
            <div className="p-1.5 sm:p-2 rounded-2xl bg-white/50 backdrop-blur-2xl border border-white/70 shadow-sm flex items-center gap-1.5 sm:gap-2">
              {isVoiceRecording ? (
                <LiveVoiceRecorder
                  onCancel={() => setIsVoiceRecording(false)}
                  onSendAudio={handleSendVoiceAudio}
                  onError={(errMsg) => addToast(errMsg, "error")}
                />
              ) : (
                <>
                  {/* Attachment (+) Button */}
                  <motion.button
                    id="btn-add-attachment"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={cn(
                      "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0",
                      pendingAttachment
                        ? "bg-rose-500 text-white shadow-xs"
                        : "bg-white/60 text-zinc-600 hover:text-zinc-900 hover:bg-white border border-white/60"
                    )}
                    title="Lampirkan dokumen, foto, atau berkas"
                  >
                    <Plus size={18} />
                  </motion.button>

                  {/* Text Input */}
                  <input
                    id="chat-message-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={
                      pendingAttachment
                        ? `Tambah keterangan untuk ${pendingAttachment.name}...`
                        : `Tulis pesan untuk ${partnerDisplayName}...`
                    }
                    disabled={isLoading}
                    className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-[13px] sm:text-sm text-zinc-900 placeholder:text-zinc-400 py-1.5 px-2 font-normal"
                  />

                  {/* Voice Note Trigger Button */}
                  {!input.trim() && !pendingAttachment && (
                    <motion.button
                      id="btn-start-voice-record"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => {
                        playCuteSound("pop");
                        setIsVoiceRecording(true);
                      }}
                      disabled={isLoading}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 bg-white/60 text-zinc-600 hover:text-rose-500 hover:bg-white border border-white/60"
                      title="Rekam pesan suara"
                    >
                      <Mic size={18} />
                    </motion.button>
                  )}

                  {/* Send Button */}
                  {(input.trim() || pendingAttachment) && (
                    <motion.button
                      id="btn-send-chat"
                      whileTap={{ scale: 0.94 }}
                      onClick={handleSend}
                      disabled={(!input.trim() && !pendingAttachment) || isLoading}
                      className={cn(
                        "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-xs",
                        (input.trim() || pendingAttachment) && !isLoading
                          ? "bg-contrast text-white active:scale-95"
                          : "bg-zinc-200/50 text-zinc-400 opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                    </motion.button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        /* View 2: LAMPIRAN (Media, Tautan, Dokumen) */
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2.5 pr-0.5 scrollbar-hide flex flex-col">
          {/* Sub-Category Pills: [ Media ] [ Tautan ] [ Dokumen ] */}
          <div className="grid grid-cols-3 p-1 rounded-xl bg-white/30 backdrop-blur-xl border border-white/50 shrink-0 shadow-xs">
            <button
              onClick={() => {
                playCuteSound("pop");
                setAttachmentCategory("media");
              }}
              className={cn(
                "py-2 px-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5",
                attachmentCategory === "media"
                  ? "bg-white text-zinc-900 shadow-xs border border-white/80 font-semibold"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <ImageIcon size={13} />
              <span>Media</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  attachmentCategory === "media" ? "bg-zinc-100 text-zinc-700" : "bg-black/[0.04] text-zinc-400"
                )}
              >
                {mediaAttachments.length}
              </span>
            </button>

            <button
              onClick={() => {
                playCuteSound("pop");
                setAttachmentCategory("links");
              }}
              className={cn(
                "py-2 px-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5",
                attachmentCategory === "links"
                  ? "bg-white text-zinc-900 shadow-xs border border-white/80 font-semibold"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <Link2 size={13} />
              <span>Tautan</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  attachmentCategory === "links" ? "bg-zinc-100 text-zinc-700" : "bg-black/[0.04] text-zinc-400"
                )}
              >
                {linkAttachments.length}
              </span>
            </button>

            <button
              onClick={() => {
                playCuteSound("pop");
                setAttachmentCategory("docs");
              }}
              className={cn(
                "py-2 px-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5",
                attachmentCategory === "docs"
                  ? "bg-white text-zinc-900 shadow-xs border border-white/80 font-semibold"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <FileText size={13} />
              <span>Dokumen</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                  attachmentCategory === "docs" ? "bg-zinc-100 text-zinc-700" : "bg-black/[0.04] text-zinc-400"
                )}
              >
                {docAttachments.length}
              </span>
            </button>
          </div>

          {/* Search Bar for Attachments */}
          <div className="relative shrink-0">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={attachmentSearch}
              onChange={(e) => setAttachmentSearch(e.target.value)}
              placeholder={
                attachmentCategory === "media"
                  ? "Cari media atau rekaman..."
                  : attachmentCategory === "links"
                  ? "Cari tautan..."
                  : "Cari dokumen..."
              }
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/40 border border-white/60 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/30 shadow-xs"
            />
          </div>

          {/* Attachment List */}
          <div className="space-y-2.5 pb-6 flex-1 flex flex-col">
            {/* 1. MEDIA CATEGORY */}
            {attachmentCategory === "media" && (
              filteredMedia.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2.5 my-auto">
                  <div className="w-12 h-12 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-zinc-400 shadow-xs">
                    <ImageIcon size={22} />
                  </div>
                  <p className="text-xs font-semibold text-zinc-800">Belum ada media</p>
                  <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                    Foto, video, dan rekaman suara yang dikirim dalam percakapan akan tersimpan di sini.
                  </p>
                </div>
              ) : (
                filteredMedia.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/40 border border-white/60 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                          item.type === "voice"
                            ? "bg-rose-500/10 text-rose-600"
                            : item.type === "video"
                            ? "bg-purple-500/10 text-purple-600"
                            : "bg-emerald-500/10 text-emerald-600"
                        )}
                      >
                        {item.type === "voice" ? (
                          <Volume2 size={16} />
                        ) : item.type === "video" ? (
                          <Video size={16} />
                        ) : (
                          <ImageIcon size={16} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-semibold text-zinc-900 truncate">
                          {item.name} ({item.sender === user ? "Kamu" : partnerDisplayName})
                        </h5>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {new Date(item.timestamp).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {item.type === "voice" ? (
                      <button
                        onClick={() =>
                          setActivePlayingUrl((prev) => (prev === item.url ? null : item.url))
                        }
                        className="px-3 py-1.5 rounded-lg bg-contrast text-white text-xs font-medium shadow-xs hover:opacity-90 transition-all shrink-0 active:scale-95"
                      >
                        {activePlayingUrl === item.url ? "Stop" : "Putar"}
                      </button>
                    ) : (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="w-8 h-8 rounded-lg bg-white/80 text-zinc-700 flex items-center justify-center border border-white/60 hover:bg-white shadow-xs shrink-0 active:scale-95"
                        title="Buka Media"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))
              )
            )}

            {/* 2. TAUTAN CATEGORY */}
            {attachmentCategory === "links" && (
              filteredLinks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2.5 my-auto">
                  <div className="w-12 h-12 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-zinc-400 shadow-xs">
                    <Link2 size={22} />
                  </div>
                  <p className="text-xs font-semibold text-zinc-800">Belum ada tautan</p>
                  <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                    Semua link website dan URL yang dibagikan melalui chat akan tersimpan rapi di sini.
                  </p>
                </div>
              ) : (
                filteredLinks.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-white/40 border border-white/60 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                        <Link2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 truncate">{item.url}</p>
                        <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                          Dari {item.sender === user ? "Kamu" : partnerDisplayName} •{" "}
                          {new Date(item.timestamp).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="w-8 h-8 rounded-lg bg-white/80 text-zinc-700 flex items-center justify-center border border-white/60 hover:bg-white shadow-xs shrink-0 active:scale-95"
                      title="Buka tautan"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ))
              )
            )}

            {/* 3. DOKUMEN CATEGORY */}
            {attachmentCategory === "docs" && (
              filteredDocs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2.5 my-auto">
                  <div className="w-12 h-12 rounded-full bg-white/40 border border-white/60 flex items-center justify-center text-zinc-400 shadow-xs">
                    <FileText size={22} />
                  </div>
                  <p className="text-xs font-semibold text-zinc-800">Belum ada dokumen</p>
                  <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                    File PDF, DOC, XLS, presentasi, atau berkas lainnya yang dikirim akan tersimpan di sini.
                  </p>
                </div>
              ) : (
                filteredDocs.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-white/40 border border-white/60 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 font-bold text-[10px] font-mono">
                        {item.ext}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                          Dari {item.sender === user ? "Kamu" : partnerDisplayName} •{" "}
                          {new Date(item.timestamp).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      download
                      className="w-8 h-8 rounded-lg bg-white/80 text-zinc-700 flex items-center justify-center border border-white/60 hover:bg-white shadow-xs shrink-0 active:scale-95"
                      title="Unduh dokumen"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Timeline({ onAction }: { onAction: () => void }) {
  const [memories, setMemories] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", desc: "", date: "" });

  const iconMap: Record<string, any> = {
    MusicIcon,
    Sparkles,
    ImageIcon,
    Calendar,
    Lock
  };

  useEffect(() => {
    fetchWithAuth("/api/memories")
      .then(res => res.json())
      .then(data => setMemories(data));
  }, []);

  const handleEdit = (m: any) => {
    setEditingId(m.id);
    setEditForm({ title: m.title, desc: m.desc, date: m.date });
  };

  const handleSave = async (id: number) => {
    await fetchWithAuth(`/api/memories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setMemories(prev => prev.map(m => m.id === id ? { ...m, ...editForm } : m));
    setEditingId(null);
    onAction();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-10 sm:space-y-12 w-full"
    >
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-block px-4 py-1 rounded-full bg-zinc-900/5 border border-zinc-900/10 mb-2"
        >
          <span className="text-[10px] font-medium text-zinc-900 uppercase tracking-[0.3em]">Our Journey</span>
        </motion.div>
        <h2 className="text-4xl sm:text-6xl font-serif text-zinc-900 tracking-tighter">Timeline</h2>
        <p className="text-xs text-zinc-400 font-serif italic">"Every moment with you is a memory I treasure."</p>
      </div>

      <div className="space-y-10 relative before:absolute before:left-8 before:top-4 before:bottom-4 before:w-px before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent">
        {memories.map((m, i) => {
          const Icon = iconMap[m.icon] || Sparkles;
          const isEditing = editingId === m.id;

          return (
            <motion.div
              key={`timeline-item-${m.id}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={!isEditing ? { x: 8 } : {}}
              onClick={() => {
                if (!isEditing) {
                  playCuteSound("bubble");
                  if (!m.locked) onAction();
                }
              }}
              className={cn(
                "relative pl-20 group",
                m.locked && !isEditing && "opacity-50 grayscale",
                !isEditing && "cursor-pointer"
              )}
            >
              <div className="absolute left-0 w-16 h-16 rounded-[2rem] bg-white border border-zinc-100 flex items-center justify-center z-10 group-hover:border-zinc-900 transition-all duration-500 shadow-2xl group-hover:shadow-zinc-900/5 group-hover:rotate-6">
                <Icon size={24} className="text-zinc-300 group-hover:text-zinc-900 transition-colors" />
              </div>
              
              <div className="glass-card p-10 space-y-4 group-hover:bg-white transition-all duration-500 relative border-white/80 shadow-3xl rounded-[3rem]">
                {isEditing ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-medium text-zinc-400 uppercase tracking-[0.2em]">Date</label>
                      <input 
                        value={editForm.date}
                        onChange={e => setEditForm({...editForm, date: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-medium text-zinc-400 uppercase tracking-[0.2em]">Title</label>
                      <input 
                        value={editForm.title}
                        onChange={e => setEditForm({...editForm, title: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-medium text-zinc-400 uppercase tracking-[0.2em]">Description</label>
                      <textarea 
                        value={editForm.desc}
                        onChange={e => setEditForm({...editForm, desc: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-xs text-zinc-600 leading-relaxed h-32 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                      />
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                      <button onClick={() => { playCuteSound("bubble"); setEditingId(null); }} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:bg-zinc-100 transition-colors">Cancel</button>
                      <button onClick={() => { playCuteSound("sparkle"); handleSave(m.id); }} className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-deep-pink text-white shadow-lg shadow-deep-pink/20">Save Memory</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-deep-pink uppercase tracking-[0.2em]">{m.date}</span>
                        <h3 className="font-bold text-zinc-900 text-2xl tracking-tight leading-none"><EmojiText text={m.title} /></h3>
                      </div>
                      <div className="flex gap-3 items-center">
                        {!m.locked && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); playCuteSound("pop"); handleEdit(m); }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-50 text-zinc-400 hover:text-deep-pink hover:bg-deep-pink/5 transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {!m.locked && (
                          <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-50 text-zinc-300 group-hover:text-deep-pink transition-all">
                            <ChevronRight size={16} />
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-zinc-500 leading-relaxed font-medium"><EmojiText text={m.desc} /></p>
                    
                    {m.locked && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center rounded-[2.5rem] border-2 border-dashed border-zinc-100">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300 shadow-inner">
                            <Lock size={28} />
                          </div>
                          <div className="text-center space-y-1">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Locked Memory</span>
                            <p className="text-[8px] text-zinc-300 font-bold uppercase tracking-tighter">Coming soon to you ✨</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function Gallery({ user, socket, onAction }: { user: string; socket: Socket | null; onAction: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWithAuth("/api/gallery")
      .then(res => res.json())
      .then(data => setPhotos(data));

    if (socket) {
      socket.on("new_gallery_photo", (photo: Photo) => {
        setPhotos(prev => {
          if (prev.some(p => p.id === photo.id)) return prev;
          return [photo, ...prev];
        });
      });
      socket.on("gallery_photo_deleted", ({ id }) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
      });
    }
  }, [socket]);

  const handleUpload = async () => {
    if (!url.trim()) return;
    playCuteSound("pop");
    try {
      const res = await fetchWithAuth("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption, sender: user }),
      });
      if (res.ok) {
        const newPhoto = await res.json();
        setPhotos(prev => [newPhoto, ...prev]);
        if (socket) {
          socket.emit("add_gallery_photo", newPhoto);
        }
      }
    } catch (error) {
      console.error("Failed to upload photo:", error);
    }
    setUrl("");
    setCaption("");
    setShowUpload(false);
    onAction();
  };

  const handleDelete = async (id: number) => {
    playCuteSound("bubble");
    try {
      const res = await fetchWithAuth(`/api/gallery/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== id));
        if (socket) {
          socket.emit("delete_gallery_photo", { id });
        }
      }
    } catch (error) {
      console.error("Failed to delete photo:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8 sm:space-y-10 w-full"
    >
      <div className="flex justify-between items-end px-2">
        <div className="space-y-2">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block px-3 py-0.5 rounded-full bg-zinc-900/5 border border-zinc-900/10 mb-1"
          >
            <span className="text-[9px] font-medium text-zinc-900 uppercase tracking-[0.3em]">Our Scrapbook</span>
          </motion.div>
          <h2 className="text-4xl sm:text-6xl font-serif text-zinc-900 tracking-tighter">Gallery</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium text-zinc-900 uppercase tracking-[0.3em] opacity-40">{photos.length} Memories</span>
            <span className="text-[8px] text-zinc-400 font-medium uppercase tracking-tighter">Captured by us</span>
          </div>
          <button 
            onClick={() => {
              playCuteSound("pop");
              setShowUpload(!showUpload);
            }}
            className={cn(
              "w-16 h-16 flex items-center justify-center rounded-2xl shadow-2xl transition-all duration-500",
              showUpload ? "bg-contrast rotate-45" : "bg-white text-zinc-900 hover:scale-110 active:scale-90 border border-zinc-100"
            )}
          >
            <Plus size={28} />
          </button>
        </div>
      </div>

      {showUpload && (
        <motion.div 
          initial={{ height: 0, opacity: 0, scale: 0.95 }}
          animate={{ height: "auto", opacity: 1, scale: 1 }}
          className="liquid-glass p-10 space-y-8 overflow-hidden border-white/80 shadow-3xl rounded-[3rem]"
        >
          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-zinc-100 rounded-[3rem] p-16 text-center cursor-pointer hover:border-zinc-900 hover:bg-zinc-50 transition-all group relative overflow-hidden"
            >
              {url && url.startsWith("data:") ? (
                <div className="relative inline-block">
                  <img src={url} alt="Preview" className="max-h-72 rounded-3xl shadow-2xl rotate-2 group-hover:rotate-0 transition-transform duration-500" referrerPolicy="no-referrer" />
                  <button 
                    onClick={(e) => { e.stopPropagation(); setUrl(""); }}
                    className="absolute -top-4 -right-4 bg-contrast w-12 h-12 rounded-2xl shadow-xl flex items-center justify-center hover:scale-110 active:scale-90"
                  >
                    <Plus size={20} className="rotate-45" />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="w-24 h-24 bg-zinc-50 rounded-[2rem] flex items-center justify-center mx-auto group-hover:scale-110 group-hover:bg-white transition-all duration-500 shadow-sm">
                    <Camera size={40} className="text-zinc-300 group-hover:text-zinc-900" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-900 uppercase tracking-[0.2em]">Click to Upload</p>
                    <p className="text-[10px] text-zinc-400 font-medium">Capture a beautiful moment together</p>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-100"></div>
              </div>
              <div className="relative flex justify-center text-[9px] font-medium uppercase tracking-[0.4em] text-zinc-300">
                <span className="bg-white px-6">Or use a URL</span>
              </div>
            </div>

            <input
              value={url.startsWith("data:") ? "" : url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste image link here..."
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-5 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-zinc-900/5 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] ml-1">Caption</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a sweet caption for this memory..."
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-deep-pink/10 transition-all"
            />
          </div>

          <button
            onClick={() => {
              playCuteSound("sparkle");
              handleUpload();
            }}
            className="w-full py-4 rounded-2xl bg-contrast font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-zinc-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={16} />
            Save Memory ✨
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {photos.map((p, i) => (
          <motion.div
            key={`gallery-item-${p.id}`}
            initial={{ opacity: 0, scale: 0.9, rotate: i % 2 === 0 ? -2 : 2 }}
            animate={{ opacity: 1, scale: 1, rotate: i % 2 === 0 ? -2 : 2 }}
            whileHover={{ scale: 1.05, rotate: 0, zIndex: 10 }}
            className="group relative"
          >
            <div className="bg-white p-3 pb-10 shadow-2xl border border-zinc-100 rounded-sm transform transition-all duration-500">
              <div className="aspect-square overflow-hidden bg-zinc-50 rounded-sm mb-4">
                <img 
                  src={p.url} 
                  alt={p.caption} 
                  className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-zinc-800 line-clamp-2 leading-tight font-serif italic">"<EmojiText text={p.caption} />"</p>
                <div className="flex justify-between items-center pt-2 border-t border-zinc-50">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">{p.sender}</span>
                  </div>
                  {p.sender === user && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                      className="p-1.5 rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    >
                      <Plus size={12} className="rotate-45" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Polaroid tape effect */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 bg-white/40 backdrop-blur-sm border border-white/60 shadow-sm rotate-2 z-20" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function Cinema({ user, videoUrl, onAction }: { user: string; videoUrl: string; onAction: () => void }) {
  const [inputUrl, setInputUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    
    // YouTube
    const ytRegExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?\/]{11}).*/;
    const ytMatch = url.match(ytRegExp);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
    }

    // TikTok
    const ttRegExp = /tiktok\.com\/.*\/video\/(\d+)/;
    const ttMatch = url.match(ttRegExp);
    if (ttMatch && ttMatch[1]) {
      return `https://www.tiktok.com/embed/v2/${ttMatch[1]}`;
    }

    return "";
  };

  const handleUpdateVideo = async () => {
    if (!inputUrl.trim()) return;
    playCuteSound("pop");
    setIsUpdating(true);
    try {
      await fetchWithAuth("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: inputUrl }),
      });
      setInputUrl("");
      onAction();
    } catch (error) {
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  const embedUrl = getEmbedUrl(videoUrl);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-serif text-zinc-900">Acaya Cinema 🍿</h2>
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Nonton bareng meskipun jauh-jauhan</p>
      </div>

      <div className="bg-white/80 backdrop-blur-md rounded-3xl p-4 border border-white/60 shadow-xl overflow-hidden">
        <div className="aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center relative group">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
                <Youtube size={32} className="text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-sm font-medium">Belum ada video yang diputar nih...</p>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Video URL (YouTube / TikTok)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste link YouTube atau TikTok di sini sayang..."
                className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-deep-pink/20 transition-all"
              />
              <button
                onClick={handleUpdateVideo}
                disabled={isUpdating || !inputUrl.trim()}
                className="btn-primary px-6 flex items-center gap-2 disabled:opacity-50"
              >
                {isUpdating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Play size={16} />
                    <span className="hidden sm:inline">Putar</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="bg-zinc-50 rounded-2xl p-3 border border-zinc-100">
            <p className="text-[10px] text-zinc-400 leading-relaxed text-center italic">
              "Video ini bakal sinkron buat kalian berdua. Kalau kamu ganti, di HP pasangan kamu juga bakal keganti otomatis! ✨"
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

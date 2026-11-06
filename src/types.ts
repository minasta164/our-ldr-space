export interface UserProfile {
  username: string;
  nickname: string;
  profilePic: string | null;
  bio: string | null;
  mood?: string;
  mood_timestamp?: string;
  focus?: string;
  focus_timestamp?: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  timestamp?: string;
}

export interface RegularMessage {
  id?: number;
  uuid: string;
  sender: string;
  text: string | null;
  voiceUrl: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  seen?: number;
  status?: "sent" | "delivered" | "read";
  timestamp: string;
  isOptimistic?: boolean;
}

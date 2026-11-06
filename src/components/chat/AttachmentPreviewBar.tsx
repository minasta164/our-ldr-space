import React from "react";
import { X, FileText, Image as ImageIcon, Video, FileSpreadsheet, FileArchive, File as GenericFile } from "lucide-react";

export interface PendingAttachment {
  file: File;
  previewUrl?: string;
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  isVideo: boolean;
}

interface AttachmentPreviewBarProps {
  attachment: PendingAttachment | null;
  onRemove: () => void;
}

export const AttachmentPreviewBar: React.FC<AttachmentPreviewBarProps> = ({
  attachment,
  onRemove,
}) => {
  if (!attachment) return null;

  const ext = attachment.name.includes(".")
    ? attachment.name.split(".").pop()?.toUpperCase() || "FILE"
    : "FILE";

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocIcon = () => {
    if (attachment.isImage) return <ImageIcon size={18} className="text-emerald-500" />;
    if (attachment.isVideo) return <Video size={18} className="text-purple-500" />;
    if (/PDF/i.test(ext)) return <FileText size={18} className="text-rose-500" />;
    if (/XLS|XLSX|CSV/i.test(ext)) return <FileSpreadsheet size={18} className="text-emerald-500" />;
    if (/ZIP|RAR|7Z/i.test(ext)) return <FileArchive size={18} className="text-amber-500" />;
    return <GenericFile size={18} className="text-sky-500" />;
  };

  return (
    <div
      id="attachment-preview-banner"
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl border border-white/80 dark:border-zinc-700/80 shadow-xs mb-2 animate-fadeIn"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Preview Thumbnail or Icon */}
        {attachment.isImage && attachment.previewUrl ? (
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/60 shadow-xs">
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center shrink-0 shadow-xs">
            {getDocIcon()}
          </div>
        )}

        {/* File Details */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
            {attachment.name}
          </p>
          <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
            <span className="font-semibold text-zinc-600 dark:text-zinc-300 uppercase">{ext}</span> • {formatFileSize(attachment.size)}
          </p>
        </div>
      </div>

      {/* Remove Button */}
      <button
        id="btn-remove-attachment"
        onClick={onRemove}
        className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-700 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-zinc-500 hover:text-rose-600 flex items-center justify-center shrink-0 transition-colors"
        title="Batalkan Lampiran"
      >
        <X size={14} />
      </button>
    </div>
  );
};

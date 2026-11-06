import React from "react";
import { 
  FileText, 
  FileSpreadsheet, 
  FileArchive, 
  FileCode, 
  File as GenericFile, 
  Download, 
  ExternalLink,
  Eye
} from "lucide-react";

interface FileAttachmentBubbleProps {
  url: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  isUser: boolean;
}

export const FileAttachmentBubble: React.FC<FileAttachmentBubbleProps> = ({
  url,
  name,
  type,
  size,
  isUser,
}) => {
  const fileName = name || url.split("/").pop()?.split("?")[0] || "Berkas Terlampir";
  const ext = fileName.includes(".") 
    ? fileName.split(".").pop()?.toUpperCase() || "FILE" 
    : "FILE";

  const lowerType = (type || "").toLowerCase();
  const lowerUrl = url.toLowerCase();
  const lowerName = fileName.toLowerCase();

  const isImage =
    lowerType.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?.*)?$/i.test(lowerUrl) ||
    /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(lowerName);

  const isVideo =
    lowerType.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(lowerUrl) ||
    /\.(mp4|webm|mov|m4v|ogg)$/i.test(lowerName);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocIcon = () => {
    if (/PDF/i.test(ext)) {
      return {
        icon: <FileText size={18} />,
        bg: "bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
        badge: "PDF",
      };
    }
    if (/XLS|XLSX|CSV|SHEET/i.test(ext)) {
      return {
        icon: <FileSpreadsheet size={18} />,
        bg: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
        badge: ext,
      };
    }
    if (/DOC|DOCX|WORD/i.test(ext)) {
      return {
        icon: <FileText size={18} />,
        bg: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
        badge: ext,
      };
    }
    if (/ZIP|RAR|7Z|TAR|GZ/i.test(ext)) {
      return {
        icon: <FileArchive size={18} />,
        bg: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
        badge: ext,
      };
    }
    if (/JSON|JS|TS|HTML|CSS|PY|JAVA|CPP/i.test(ext)) {
      return {
        icon: <FileCode size={18} />,
        bg: "bg-purple-500/15 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
        badge: ext,
      };
    }
    return {
      icon: <GenericFile size={18} />,
      bg: "bg-zinc-500/15 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
      badge: ext,
    };
  };

  if (isImage) {
    return (
      <div className="py-1 max-w-[280px] sm:max-w-[320px]">
        <div className="relative rounded-xl overflow-hidden border border-white/40 shadow-xs group bg-black/5">
          <img
            src={url}
            alt={fileName}
            className="w-full max-h-64 object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.02]"
            referrerPolicy="no-referrer"
            onClick={() => window.open(url, "_blank")}
          />
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          >
            <Eye size={12} />
            <span>Lihat</span>
          </a>
        </div>
        {size && (
          <span className="text-[10px] opacity-70 font-mono mt-1 block">
            {formatFileSize(size)}
          </span>
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="py-1 max-w-[280px] sm:max-w-[320px]">
        <div className="rounded-xl overflow-hidden border border-white/40 shadow-xs bg-black/90">
          <video
            src={url}
            controls
            playsInline
            className="w-full max-h-64 object-contain"
          />
        </div>
        {size && (
          <span className="text-[10px] opacity-70 font-mono mt-1 block">
            {formatFileSize(size)}
          </span>
        )}
      </div>
    );
  }

  const docStyle = getDocIcon();
  const formattedSize = formatFileSize(size);

  return (
    <div
      id={`file-attachment-${encodeURIComponent(fileName.slice(0, 15))}`}
      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all my-1 min-w-[220px] max-w-[300px] sm:max-w-[340px] shadow-xs ${
        isUser
          ? "bg-white/20 border-white/30 text-white"
          : "bg-white/60 border-white/80 text-zinc-900"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Document Format Icon */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold shadow-xs ${
            isUser ? "bg-white/25 text-white" : docStyle.bg
          }`}
        >
          {docStyle.icon}
        </div>

        {/* File Details */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate leading-tight" title={fileName}>
            {fileName}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] opacity-80 mt-0.5 font-mono">
            <span className="px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 uppercase font-semibold">
              {docStyle.badge}
            </span>
            {formattedSize && <span>• {formattedSize}</span>}
          </div>
        </div>
      </div>

      {/* Action Download / Open */}
      <a
        id="btn-download-attachment"
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        download={fileName}
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-xs ${
          isUser
            ? "bg-white text-zinc-900 hover:bg-white/90"
            : "bg-contrast text-white hover:opacity-90"
        }`}
        title="Unduh / Buka Dokumen"
      >
        <Download size={14} />
      </a>
    </div>
  );
};

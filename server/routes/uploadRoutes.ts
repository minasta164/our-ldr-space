import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      if (file.mimetype.includes("webm")) ext = ".webm";
      else if (file.mimetype.includes("mp4") || file.mimetype.includes("m4a")) ext = ".m4a";
      else if (file.mimetype.includes("ogg")) ext = ".ogg";
      else if (file.mimetype.includes("wav")) ext = ".wav";
      else if (file.mimetype.includes("png")) ext = ".png";
      else if (file.mimetype.includes("jpeg") || file.mimetype.includes("jpg")) ext = ".jpg";
      else ext = ".dat";
    }
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname || "upload"}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Permissive for audio, video, images and binary blobs
    const isAudio = file.mimetype.startsWith("audio/") || /mp3|wav|ogg|m4a|mp4|webm|aac|flac|opus|weba/i.test(file.originalname);
    const isImage = file.mimetype.startsWith("image/") || /jpeg|jpg|png|gif|webp|svg/i.test(file.originalname);
    const isVideo = file.mimetype.startsWith("video/") || /mp4|webm|mov|mkv/i.test(file.originalname);
    const isBlob = file.mimetype === "application/octet-stream" || !file.mimetype;
    
    if (isAudio || isImage || isVideo || isBlob) {
      return cb(null, true);
    }
    return cb(null, true);
  }
});

const router = Router();

router.post("/", (req: any, res: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      console.error("Upload multer error:", err);
      return res.status(400).json({ error: err.message || "Gagal mengunggah file" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }
    
    const url = `/uploads/${req.file.filename}`;
    res.json({ 
      url, 
      success: true,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
});

export default router;


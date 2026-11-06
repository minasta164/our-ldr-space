import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

// Import modular components
import { initDb } from "./server/database/db.js";
import { setupSocketHandlers } from "./server/sockets/socketHandler.js";
import messageRoutes from "./server/routes/messageRoutes.js";
import profileRoutes from "./server/routes/profileRoutes.js";
import uploadRoutes from "./server/routes/uploadRoutes.js";
import apiRoutes from "./server/routes/apiRoutes.js";
import authRoutes from "./server/routes/authRoutes.js";
import { errorHandler } from "./server/middleware/errorHandler.js";
import { authenticate } from "./server/middleware/auth.js";

dotenv.config();

async function startServer() {
  // Initialize Database
  initDb();

  const app = express();
  const httpServer = createServer(app);
  
  // Socket.IO Setup
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Reliability settings
    connectionStateRecovery: {
      // the backup duration of the sessions and the packets
      maxDisconnectionDuration: 2 * 60 * 1000,
      // whether to skip middlewares upon successful recovery
      skipMiddlewares: true,
    }
  });

  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Modular Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/messages", authenticate, messageRoutes);
  app.use("/api/profile", authenticate, profileRoutes);
  app.use("/api/upload", authenticate, uploadRoutes);
  app.use("/api", apiRoutes);

  // Catch-all for undefined /api routes so they return JSON 404 instead of HTML from Vite
  app.all(["/api", "/api/*"], (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
  });

  // Socket Handlers
  setupSocketHandlers(io);

  // Centralized Error Handling for API routes
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

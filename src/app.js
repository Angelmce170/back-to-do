import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import taskRoutes from "./routes/task.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import projectRoutes from "./routes/project.routes.js";
import { connectToDB } from "./db/connect.js";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://front-to-do.vercel.app",
  process.env.FRONT_ORIGIN || ""
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const isAllowedOrigin = allowedOrigins.includes(origin);
    const isVercelApp = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

    callback(null, isAllowedOrigin || isVercelApp);
  },
  credentials: true
}));

app.use(express.json({ limit: "6mb" }));
app.use(morgan("dev"));

// Esta ruta va ANTES de conectar a Mongo
app.get("/", (_req, res) => {
  res.json({ ok: true, name: "ToDo Api" });
});

// Mongo solo para rutas de API
app.use("/api", async (_req, _res, next) => {
  try {
    await connectToDB();
    next();
  } catch (e) {
    next(e);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/projects", projectRoutes);

// Para que Vercel muestre error JSON y no crashee feo
app.use((err, _req, res, _next) => {
  console.error("ERROR API:", err);
  res.status(500).json({
    ok: false,
    error: err.message || "Error interno"
  });
});

export default app;

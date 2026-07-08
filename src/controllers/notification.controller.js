import Task from "../models/task.js";
import User from "../models/user.js";
import { getFirebaseAdmin } from "../firebase.js";

const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function cleanToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cronIsAllowed(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return req.headers["x-cron-secret"] === secret || req.query?.secret === secret;
}

function taskMessage(task) {
  const title = `Recordatorio: ${task.title}`;
  const body = task.description || "Tienes una tarea pendiente.";
  const reminderAt = task.reminderAt ? task.reminderAt.toISOString() : "";

  return {
    title,
    body,
    taskId: String(task._id),
    reminderAt,
    tag: `todo-${task._id}-${reminderAt}`,
    url: "/dashboard",
    icon: "/icons/icon-192x192.png",
  };
}

async function removeInvalidTokens(userId, tokens) {
  if (!tokens.length) return;

  await User.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: { $in: tokens } },
  });
}

export async function saveToken(req, res) {
  const token = cleanToken(req.body?.token);
  if (!token) return res.status(400).json({ message: "Token de Firebase requerido" });

  await User.findByIdAndUpdate(req.userId, {
    $addToSet: { fcmTokens: token },
  });

  res.json({ ok: true });
}

export async function deleteToken(req, res) {
  const token = cleanToken(req.body?.token);
  if (!token) return res.json({ ok: true });

  await User.findByIdAndUpdate(req.userId, {
    $pull: { fcmTokens: token },
  });

  res.json({ ok: true });
}

export async function sendDueReminders(req, res) {
  if (!req.userId && !cronIsAllowed(req)) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const firebase = getFirebaseAdmin();
  if (!firebase) {
    return res.status(503).json({ message: "Firebase no está configurado" });
  }

  const now = new Date();
  const query = {
    deleted: false,
    status: { $ne: "Completada" },
    reminderAt: { $ne: null, $lte: now },
    reminderSentAt: null,
    ...(req.userId ? { user: req.userId } : {}),
  };
  const tasks = await Task.find(query).sort({ reminderAt: 1 }).limit(100);
  if (!tasks.length) return res.json({ ok: true, sent: [] });

  const userIds = [...new Set(tasks.map((task) => String(task.user)))];
  const users = await User.find({ _id: { $in: userIds } }).select("_id fcmTokens");
  const tokensByUser = new Map(users.map((user) => [String(user._id), user.fcmTokens || []]));
  const sent = [];

  for (const task of tasks) {
    const tokens = tokensByUser.get(String(task.user)) || [];
    if (!tokens.length) continue;

    const response = await firebase.messaging().sendEachForMulticast({
      tokens,
      data: taskMessage(task),
      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    });

    const invalidTokens = response.responses
      .map((result, index) => (result.error && invalidTokenCodes.has(result.error.code) ? tokens[index] : null))
      .filter(Boolean);

    await removeInvalidTokens(task.user, invalidTokens);

    if (response.successCount > 0) {
      task.reminderSentAt = now;
      await task.save();
      sent.push({
        taskId: String(task._id),
        reminderAt: task.reminderAt.toISOString(),
      });
    }
  }

  res.json({ ok: true, sent });
}

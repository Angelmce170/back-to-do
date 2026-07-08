import Task from "../models/task.js";
import User from "../models/user.js";
import webpush from "web-push";

function cleanToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cronIsAllowed(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return (
    req.headers["x-cron-secret"] === secret ||
    req.query?.secret === secret ||
    req.params?.secret === secret
  );
}

function getWebPush() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;

  const subject = process.env.WEB_PUSH_SUBJECT || "mailto:todo-pwa@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return webpush;
}

function cleanSubscription(value) {
  if (!value || typeof value !== "object") return null;

  const endpoint = cleanToken(value.endpoint);
  const p256dh = cleanToken(value.keys?.p256dh);
  const auth = cleanToken(value.keys?.auth);
  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh, auth },
  };
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

async function removeInvalidSubscriptions(userId, endpoints) {
  if (!endpoints.length) return;

  await User.findByIdAndUpdate(userId, {
    $pull: { pushSubscriptions: { endpoint: { $in: endpoints } } },
  });
}

export async function publicKey(_req, res) {
  const key = process.env.WEB_PUSH_PUBLIC_KEY;
  if (!key) return res.status(503).json({ message: "Web Push no está configurado" });

  res.json({ publicKey: key });
}

export async function saveSubscription(req, res) {
  const subscription = cleanSubscription(req.body?.subscription ?? req.body);
  if (!subscription) return res.status(400).json({ message: "Suscripción web push requerida" });

  const user = await User.findById(req.userId).select("pushSubscriptions");
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  user.pushSubscriptions = (user.pushSubscriptions || []).filter(
    (item) => item?.endpoint !== subscription.endpoint
  );
  user.pushSubscriptions.push(subscription);
  await user.save();

  res.json({ ok: true });
}

export async function deleteSubscription(req, res) {
  const endpoint = cleanToken(req.body?.endpoint ?? req.body?.subscription?.endpoint);
  if (!endpoint) return res.json({ ok: true });

  await User.findByIdAndUpdate(req.userId, {
    $pull: { pushSubscriptions: { endpoint } },
  });

  res.json({ ok: true });
}

export async function sendDueReminders(req, res) {
  if (!req.userId && !cronIsAllowed(req)) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const pusher = getWebPush();
  if (!pusher) {
    return res.status(503).json({ message: "Web Push no está configurado" });
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
  const users = await User.find({ _id: { $in: userIds } }).select("_id pushSubscriptions");
  const tokensByUser = new Map(
    users.map((user) => [String(user._id), (user.pushSubscriptions || []).filter(Boolean)])
  );
  const sent = [];

  for (const task of tasks) {
    const subscriptions = tokensByUser.get(String(task.user)) || [];
    if (!subscriptions.length) continue;

    let successCount = 0;
    const invalidEndpoints = [];
    const payload = JSON.stringify(taskMessage(task));

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await pusher.sendNotification(subscription, payload);
          successCount += 1;
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            invalidEndpoints.push(subscription.endpoint);
          } else {
            console.error("web push error:", error?.message || error);
          }
        }
      })
    );

    await removeInvalidSubscriptions(task.user, invalidEndpoints);

    if (successCount > 0) {
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

export async function cronStatus(req, res) {
  if (!cronIsAllowed(req)) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const now = new Date();
  const pendingReminders = await Task.countDocuments({
    deleted: false,
    status: { $ne: "Completada" },
    reminderAt: { $ne: null, $lte: now },
    reminderSentAt: null,
  });
  const usersWithSubscriptions = await User.countDocuments({ "pushSubscriptions.0": { $exists: true } });

  res.json({
    ok: true,
    webPushConfigured: Boolean(getWebPush()),
    pendingReminders,
    usersWithSubscriptions,
    serverTime: now.toISOString(),
  });
}

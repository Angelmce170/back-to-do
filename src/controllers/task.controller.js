import Task from "../models/task.js";

const allowed = ["Pendiente", "En proceso", "En Progreso", "Completada"];

function normalizeStatus(value) {
  return value === "En Progreso" ? "En proceso" : value;
}

function serializeTask(task) {
  const item = task.toObject ? task.toObject() : task;
  return { ...item, status: normalizeStatus(item.status) };
}

function parseReminderAt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function list(req, res) {
  const items = await Task.find({ user: req.userId, deleted: false }).sort({ createdAt: -1 });
  res.json({ items: items.map(serializeTask) });
}

export async function create(req, res) {
  const { title, description = "", status = "Pendiente", clienteId, reminderAt } = req.body;
  const normalizedStatus = normalizeStatus(status);
  if (!title) return res.status(400).json({ message: "El título es requerido" });

  const task = await Task.create({
    user: req.userId,
    title,
    description,
    status: allowed.includes(normalizedStatus) ? normalizedStatus : "Pendiente",
    reminderAt: parseReminderAt(reminderAt) ?? null,
    reminderSentAt: null,
    clienteId,
  });
  res.status(201).json({ task });
}

export async function update(req, res) {
  const { id } = req.params;
  const { title, description, status, reminderAt } = req.body;

  const normalizedStatus = normalizeStatus(status);
  if (status && !allowed.includes(normalizedStatus))
    return res.status(400).json({ message: "Estado inválido" });

  const changes = {};
  if (title !== undefined) changes.title = title;
  if (description !== undefined) changes.description = description;
  if (status !== undefined) changes.status = normalizedStatus;
  if (reminderAt !== undefined) {
    const parsedReminderAt = parseReminderAt(reminderAt);
    if (parsedReminderAt === undefined) {
      return res.status(400).json({ message: "Recordatorio inválido" });
    }

    changes.reminderAt = parsedReminderAt;
    changes.reminderSentAt = null;
  }

  const task = await Task.findOneAndUpdate(
    { _id: id, user: req.userId },
    changes,
    { new: true }
  );
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });
  res.json({ task: serializeTask(task) });
}

export async function remove(req, res) {
  const { id } = req.params;
  const task = await Task.findOneAndUpdate(
    { _id: id, user: req.userId },
    { deleted: true },
    { new: true }
  );
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });
  res.json({ ok: true });
}
/** ENDPOINT PARA SINCRONIZACIÓN OFFLINE: crea/actualiza por clienteId y devuelve el mapeo */
export async function bulksync(req, res) {
  try {
    const { tasks = [] } = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ message: "tasks debe ser array" });
    }

    // Normaliza y filtra válidos
    const clean = tasks
      .filter(t => t && t.clienteId && t.title)
      .map(t => ({
        clienteId: String(t.clienteId),
        title: String(t.title),
        description: t.description ?? "",
        status: allowed.includes(normalizeStatus(t.status)) ? normalizeStatus(t.status) : "Pendiente",
        reminderAt: parseReminderAt(t.reminderAt) ?? null,
      }));

    if (!clean.length) return res.json({ mapping: [] });

    // 1) bulkWrite con UPSERT por (user, clienteId)
    const ops = clean.map(t => ({
      updateOne: {
        filter: { user: req.userId, clienteId: t.clienteId },
        update: {
          $set: {
            title: t.title,
            description: t.description,
            status: t.status,
            reminderAt: t.reminderAt,
            reminderSentAt: null,
          },
          $setOnInsert: {
            user: req.userId,
            clienteId: t.clienteId,
          }
        },
        upsert: true,
      }
    }));

    await Task.bulkWrite(ops, { ordered: false }); // no importa el orden, continúa si una falla

    // 2) devolver mapping clienteId -> serverId
    const clienteIds = clean.map(t => t.clienteId);
    const docs = await Task.find({ user: req.userId, clienteId: { $in: clienteIds } })
                           .select("_id clienteId");

    const mapping = docs.map(d => ({ clienteId: d.clienteId, serverId: String(d._id) }));
    return res.json({ mapping });
  } catch (err) {
    console.error("bulksync error:", err);
    return res.status(500).json({ message: "Error en bulksync" });
  }
}

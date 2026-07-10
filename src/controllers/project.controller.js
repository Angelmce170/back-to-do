import { nanoid } from "nanoid";
import mongoose from "mongoose";
import webpush from "web-push";
import Project from "../models/project.js";
import ProjectAlert from "../models/projectAlert.js";
import User from "../models/user.js";

const allowedStatuses = ["Pendiente", "En Progreso", "Completada"];
const maxAttachmentSize = 4 * 1024 * 1024;
const alertRetentionMs = 1000 * 60 * 60 * 24 * 183;

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cursorValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;

  return Math.min(Math.max(numberValue, 0), 1);
}

function userId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
}

function sameId(a, b) {
  return userId(a) === userId(b);
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parseDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cleanEmails(value) {
  const source = Array.isArray(value) ? value.join(",") : text(value);
  return [...new Set(
    source
      .split(/[,\n;]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )];
}

function cleanUserIds(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => String(id))
      .filter((id) => isObjectId(id))
  )];
}

function alertLimit(value) {
  const limit = Number(value || 60);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 60;
}

async function cleanupOldAlerts() {
  await ProjectAlert.deleteMany({
    createdAt: { $lt: new Date(Date.now() - alertRetentionMs) },
  });
}

function envValue(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function getWebPush() {
  const publicKey = envValue("WEB_PUSH_PUBLIC_KEY") || envValue("VAPID_PUBLIC_KEY");
  const privateKey = envValue("WEB_PUSH_PRIVATE_KEY") || envValue("VAPID_PRIVATE_KEY");
  const subject = envValue("WEB_PUSH_SUBJECT") || envValue("VAPID_SUBJECT") || "mailto:todo-pwa@example.com";
  if (!publicKey || !privateKey) return null;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

function cleanAttachment(value) {
  if (!value || typeof value !== "object") return undefined;

  const name = text(value.name);
  const type = text(value.type, "application/octet-stream");
  const dataUrl = text(value.dataUrl);
  const size = Number(value.size || 0);

  if (!name || !dataUrl || dataUrl.length > maxAttachmentSize) return undefined;

  return {
    name,
    type,
    size: Number.isFinite(size) ? size : 0,
    dataUrl,
    uploadedAt: new Date(),
  };
}

function memberRecord(project, currentUserId) {
  return (project.members || []).find((member) => sameId(member.user, currentUserId));
}

function isProjectLeader(project, currentUserId) {
  if (sameId(project.creator, currentUserId)) return true;

  const member = memberRecord(project, currentUserId);
  return member?.role === "leader" && member?.status === "active";
}

function isActiveMember(project, currentUserId) {
  if (sameId(project.creator, currentUserId)) return true;

  const member = memberRecord(project, currentUserId);
  return member?.status === "active";
}

function isProjectMember(project, currentUserId) {
  return Boolean(memberRecord(project, currentUserId)) || sameId(project.creator, currentUserId);
}

function activeMemberIds(project) {
  return (project.members || [])
    .filter((member) => member.status === "active")
    .map((member) => userId(member.user));
}

function participantCount(project) {
  return (project.members || []).length;
}

function hasRoom(project, amount = 1) {
  return participantCount(project) + amount <= project.participantLimit;
}

function publicUser(value) {
  if (!value) return null;
  return {
    id: userId(value),
    name: value.name || "Usuario",
    email: value.email || "",
    avatarColor: value.avatarColor || "#2a8b7b",
  };
}

function serializeProject(project, currentUserId) {
  const item = project.toObject ? project.toObject() : project;
  const now = Date.now();
  const myMember = (item.members || []).find((member) => sameId(member.user, currentUserId));

  item.creator = publicUser(item.creator);
  item.members = (item.members || []).map((member) => ({
    ...member,
    user: publicUser(member.user),
    invitedBy: publicUser(member.invitedBy),
  }));
  item.tasks = (item.tasks || []).map((task) => ({
    ...task,
    assignedTo: publicUser(task.assignedTo),
    createdBy: publicUser(task.createdBy),
    comments: (task.comments || []).map((comment) => ({
      ...comment,
      author: publicUser(comment.author),
    })),
  }));
  item.messages = (item.messages || []).map((message) => ({
    ...message,
    author: publicUser(message.author),
    to: publicUser(message.to),
  }));
  item.activity = (item.activity || []).map((activity) => ({
    ...activity,
    user: publicUser(activity.user),
  }));
  item.presence = (item.presence || [])
    .filter((presence) => {
      const updatedAt = new Date(presence.updatedAt).getTime();
      return !sameId(presence.user, currentUserId) && now - updatedAt < 20000;
    })
    .map((presence) => ({
      ...presence,
      user: publicUser(presence.user),
    }));
  item.myStatus = myMember?.status || (sameId(project.creator, currentUserId) ? "active" : "");
  item.myRole = isProjectLeader(project, currentUserId) ? "leader" : "member";
  item.isLeader = isProjectLeader(project, currentUserId);

  return item;
}

async function populateProject(project) {
  return project.populate([
    { path: "creator", select: "name email avatarColor" },
    { path: "members.user", select: "name email avatarColor" },
    { path: "members.invitedBy", select: "name email avatarColor" },
    { path: "pendingEmails.invitedBy", select: "name email avatarColor" },
    { path: "tasks.assignedTo", select: "name email avatarColor" },
    { path: "tasks.createdBy", select: "name email avatarColor" },
    { path: "tasks.comments.author", select: "name email avatarColor" },
    { path: "messages.author", select: "name email avatarColor" },
    { path: "messages.to", select: "name email avatarColor" },
    { path: "presence.user", select: "name email avatarColor" },
    { path: "activity.user", select: "name email avatarColor" },
  ]);
}

async function findProjectForUser(projectId, currentUserId) {
  if (!isObjectId(projectId)) return null;

  const project = await Project.findById(projectId);
  if (!project || !isProjectMember(project, currentUserId)) return null;

  return populateProject(project);
}

async function pushToUser(userIdValue, payload) {
  const pusher = getWebPush();
  if (!pusher) return;

  const user = await User.findById(userIdValue).select("pushSubscriptions");
  const subscriptions = (user?.pushSubscriptions || []).filter(Boolean);
  if (!subscriptions.length) return;

  const invalidEndpoints = [];
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await pusher.sendNotification(subscription, JSON.stringify(payload));
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
        }
      }
    })
  );

  if (invalidEndpoints.length) {
    await User.findByIdAndUpdate(userIdValue, {
      $pull: { pushSubscriptions: { endpoint: { $in: invalidEndpoints } } },
    });
  }
}

function projectAlertUrl(project, data = {}) {
  const params = new URLSearchParams({ project: String(project._id) });
  if (data.chat === "group" || data.chat === "direct") params.set("chat", data.chat);
  if (data.chatUserId) params.set("chatUser", String(data.chatUserId));

  return `/dashboard?${params.toString()}`;
}

async function createProjectAlert({ user, project, type, title, body, data = {} }) {
  if (!user) return;
  const alertData = {
    projectId: String(project._id),
    ...data,
  };

  await ProjectAlert.create({
    user,
    project: project._id,
    type,
    title,
    body,
    data: alertData,
  });

  await pushToUser(user, {
    title,
    body,
    url: data.url || projectAlertUrl(project, alertData),
    icon: "/icons/icon-192x192.png",
    tag: `project-${type}-${project._id}-${Date.now()}`,
  });
}

async function inviteUsers(project, users, sender, source = "usuario") {
  const invited = [];

  for (const user of users) {
    if (!user || sameId(user._id, project.creator) || memberRecord(project, user._id)) continue;
    if (!hasRoom(project)) break;

    project.members.push({
      user: user._id,
      role: "member",
      status: "invited",
      invitedBy: sender._id,
      joinedAt: null,
    });
    invited.push(user);
  }

  if (invited.length) await project.save();

  await Promise.all(
    invited.map((user) =>
      createProjectAlert({
        user: user._id,
        project,
        type: "invite",
        title: "Invitación a proyecto",
        body:
          source === "correo"
            ? `${sender.name} (${sender.email}) te invitó a "${project.title}".`
            : `${sender.name} te invitó a "${project.title}".`,
        data: { projectId: String(project._id), invitedBy: String(sender._id) },
      })
    )
  );

  return invited;
}

function appendActivity(project, userIdValue, area, textValue) {
  project.activity.push({
    user: userIdValue,
    area: text(area, "proyecto"),
    text: textValue,
  });
  project.activity = project.activity.slice(-40);
}

export async function listProjects(req, res) {
  const projects = await Project.find({
    $or: [{ creator: req.userId }, { "members.user": req.userId }],
  }).sort({ updatedAt: -1 });

  await Promise.all(projects.map(populateProject));
  res.json({ items: projects.map((project) => serializeProject(project, req.userId)) });
}

export async function projectDetails(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

  res.json({ project: serializeProject(project, req.userId) });
}

export async function createProject(req, res) {
  const title = text(req.body.title);
  if (!title) return res.status(400).json({ message: "El título del proyecto es requerido" });

  const creator = await User.findById(req.userId).select("name email avatarColor friends");
  if (!creator) return res.status(404).json({ message: "Usuario no encontrado" });

  const mode = req.body.mode === "group" ? "group" : "individual";
  const requestedLimit = Number(req.body.participantLimit || (mode === "group" ? 5 : 1));
  const participantLimit = mode === "group" ? Math.min(Math.max(requestedLimit, 1), 50) : 1;
  const attachment = cleanAttachment(req.body.attachment);
  const project = await Project.create({
    creator: req.userId,
    title,
    description: text(req.body.description),
    mode,
    participantLimit,
    inviteCode: nanoid(14),
    ...(attachment ? { attachment } : {}),
    members: [{
      user: req.userId,
      role: "leader",
      status: "active",
      invitedBy: req.userId,
      joinedAt: new Date(),
    }],
  });

  if (mode === "group") {
    const memberIds = cleanUserIds(req.body.memberIds).filter((id) => id !== req.userId);
    const inviteEmails = cleanEmails(req.body.inviteEmails);

    const selectedUsers = memberIds.length
      ? await User.find({ _id: { $in: memberIds } }).select("name email avatarColor")
      : [];
    await inviteUsers(project, selectedUsers, creator, "usuario");

    const emailUsers = inviteEmails.length
      ? await User.find({ email: { $in: inviteEmails }, _id: { $ne: req.userId } }).select("name email avatarColor")
      : [];
    await inviteUsers(project, emailUsers, creator, "correo");

    const existingEmails = new Set(emailUsers.map((user) => user.email));
    const pendingEmails = inviteEmails
      .filter((email) => !existingEmails.has(email))
      .slice(0, Math.max(project.participantLimit - participantCount(project), 0))
      .map((email) => ({ email, invitedBy: req.userId }));

    if (pendingEmails.length) {
      project.pendingEmails.push(...pendingEmails);
      await project.save();
    }
  }

  const populated = await populateProject(project);
  res.status(201).json({ project: serializeProject(populated, req.userId) });
}

export async function updateProject(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isProjectLeader(project, req.userId)) {
    return res.status(403).json({ message: "Solo el líder puede editar el proyecto" });
  }

  const nextTitle = text(req.body.title);
  if (nextTitle) project.title = nextTitle;
  if (req.body.description !== undefined) project.description = text(req.body.description);

  const attachment = cleanAttachment(req.body.attachment);
  if (attachment) project.attachment = attachment;

  appendActivity(project, req.userId, "proyecto", "actualizó los datos del proyecto");
  await project.save();

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function inviteByEmail(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isProjectLeader(project, req.userId)) {
    return res.status(403).json({ message: "Solo el líder puede invitar" });
  }

  const sender = await User.findById(req.userId).select("name email avatarColor");
  const emails = cleanEmails(req.body.emails);
  const users = emails.length
    ? await User.find({ email: { $in: emails }, _id: { $ne: req.userId } }).select("name email avatarColor")
    : [];

  await inviteUsers(project, users, sender, "correo");

  const existingEmails = new Set(users.map((user) => user.email));
  const pendingEmails = emails
    .filter((email) => !existingEmails.has(email) && !(project.pendingEmails || []).some((item) => item.email === email))
    .slice(0, Math.max(project.participantLimit - participantCount(project), 0))
    .map((email) => ({ email, invitedBy: req.userId }));

  if (pendingEmails.length) {
    project.pendingEmails.push(...pendingEmails);
    await project.save();
  }

  appendActivity(project, req.userId, "miembros", "envió invitaciones al proyecto");
  await project.save();

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function inviteFriends(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isProjectLeader(project, req.userId)) {
    return res.status(403).json({ message: "Solo el líder puede invitar" });
  }

  const sender = await User.findById(req.userId).select("name email avatarColor");
  const userIds = cleanUserIds(req.body.userIds).filter((id) => id !== req.userId);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("name email avatarColor")
    : [];

  await inviteUsers(project, users, sender, "usuario");
  appendActivity(project, req.userId, "miembros", "invitó amigos al proyecto");
  await project.save();

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function acceptInvitation(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

  const member = memberRecord(project, req.userId);
  if (!member) return res.status(403).json({ message: "No tienes invitación a este proyecto" });

  member.status = "active";
  member.joinedAt = new Date();
  appendActivity(project, req.userId, "miembros", "aceptó la invitación");
  await project.save();
  await ProjectAlert.updateMany({ user: req.userId, project: project._id, type: "invite" }, { read: true });

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function joinByCode(req, res) {
  const project = await Project.findOne({ inviteCode: req.params.code });
  if (!project) return res.status(404).json({ message: "Invitación no encontrada" });
  if (project.mode !== "group") return res.status(400).json({ message: "Este proyecto es individual" });
  if (!memberRecord(project, req.userId) && !hasRoom(project)) {
    return res.status(409).json({ message: "El proyecto ya llegó al límite de participantes" });
  }

  const currentMember = memberRecord(project, req.userId);
  if (currentMember) {
    currentMember.status = "active";
    currentMember.joinedAt = currentMember.joinedAt || new Date();
  } else {
    project.members.push({
      user: req.userId,
      role: "member",
      status: "active",
      joinedAt: new Date(),
      invitedBy: project.creator,
    });
  }

  appendActivity(project, req.userId, "miembros", "se unió por enlace");
  await project.save();
  if (!sameId(project.creator, req.userId)) {
    await createProjectAlert({
      user: project.creator,
      project,
      type: "system",
      title: "Nuevo participante",
      body: "Alguien se unió a tu proyecto por enlace.",
      data: { projectId: String(project._id) },
    });
  }

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function createProjectTask(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isProjectLeader(project, req.userId)) {
    return res.status(403).json({ message: "Solo el líder puede asignar tareas" });
  }

  const title = text(req.body.title);
  if (!title) return res.status(400).json({ message: "El título de la tarea es requerido" });

  const assignedTo = text(req.body.assignedTo);
  if (!assignedTo || !isActiveMember(project, assignedTo)) {
    return res.status(400).json({ message: "Selecciona un miembro activo del proyecto" });
  }

  const dueAt = parseDate(req.body.dueAt);
  if (dueAt === undefined) return res.status(400).json({ message: "Fecha inválida" });

  const task = {
    title,
    description: text(req.body.description),
    assignedTo,
    dueAt,
    status: "Pendiente",
    createdBy: req.userId,
  };
  project.tasks.push(task);
  appendActivity(project, req.userId, "tareas", `asignó la tarea "${title}"`);
  await project.save();

  if (assignedTo !== req.userId) {
    await createProjectAlert({
      user: assignedTo,
      project,
      type: "task",
      title: "Nueva tarea asignada",
      body: `Te asignaron "${title}" en "${project.title}".`,
      data: { projectId: String(project._id) },
    });
  }

  const populated = await populateProject(project);
  res.status(201).json({ project: serializeProject(populated, req.userId) });
}

export async function updateProjectTask(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isActiveMember(project, req.userId)) {
    return res.status(403).json({ message: "Acepta la invitación para modificar tareas" });
  }

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  const leader = isProjectLeader(project, req.userId);
  const assigned = sameId(task.assignedTo, req.userId);
  if (!leader && !assigned) {
    return res.status(403).json({ message: "Solo puedes actualizar tus tareas asignadas" });
  }

  const previousStatus = task.status;

  if (leader) {
    if (req.body.title !== undefined) task.title = text(req.body.title, task.title);
    if (req.body.description !== undefined) task.description = text(req.body.description);
    if (req.body.assignedTo !== undefined) {
      const assignedTo = text(req.body.assignedTo);
      if (!isActiveMember(project, assignedTo)) {
        return res.status(400).json({ message: "El asignado debe ser miembro activo" });
      }
      task.assignedTo = assignedTo;
    }
    if (req.body.dueAt !== undefined) {
      const dueAt = parseDate(req.body.dueAt);
      if (dueAt === undefined) return res.status(400).json({ message: "Fecha inválida" });
      task.dueAt = dueAt;
      task.overdueAlertSentAt = null;
    }
  }

  if (req.body.status !== undefined) {
    if (!assigned) {
      return res.status(403).json({ message: "Solo el responsable puede cambiar el estatus" });
    }
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: "Estado inválido" });
    }
    task.status = req.body.status;
    task.completedAt = req.body.status === "Completada" ? new Date() : null;
  }

  appendActivity(project, req.userId, "tareas", `actualizó "${task.title}"`);
  await project.save();

  if (previousStatus !== "Completada" && task.status === "Completada" && !sameId(project.creator, req.userId)) {
    await createProjectAlert({
      user: project.creator,
      project,
      type: "completed",
      title: "Tarea completada",
      body: `Completaron "${task.title}" en "${project.title}".`,
      data: { projectId: String(project._id), taskId: String(task._id) },
    });
  } else if (leader && !sameId(task.assignedTo, req.userId)) {
    await createProjectAlert({
      user: task.assignedTo,
      project,
      type: "task",
      title: "Tarea actualizada",
      body: `Se actualizó "${task.title}" en "${project.title}".`,
      data: { projectId: String(project._id), taskId: String(task._id) },
    });
  }

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function addTaskComment(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isActiveMember(project, req.userId)) {
    return res.status(403).json({ message: "Acepta la invitación para comentar" });
  }

  const task = project.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  const message = text(req.body.message);
  if (!message) return res.status(400).json({ message: "Escribe un comentario" });

  task.comments.push({ author: req.userId, message });
  appendActivity(project, req.userId, "comentarios", `comentó en "${task.title}"`);
  await project.save();

  const recipients = [userId(task.assignedTo), userId(project.creator)].filter(
    (id, index, list) => id && id !== req.userId && list.indexOf(id) === index
  );
  await Promise.all(
    recipients.map((id) =>
      createProjectAlert({
        user: id,
        project,
        type: "message",
        title: "Nuevo comentario",
        body: `Comentaron en "${task.title}".`,
        data: { projectId: String(project._id), taskId: String(task._id) },
      })
    )
  );

  const populated = await populateProject(project);
  res.json({ project: serializeProject(populated, req.userId) });
}

export async function sendProjectMessage(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isActiveMember(project, req.userId)) {
    return res.status(403).json({ message: "Acepta la invitación para usar el chat" });
  }

  const textValue = text(req.body.text);
  if (!textValue) return res.status(400).json({ message: "Escribe un mensaje" });

  const scope = req.body.scope === "direct" ? "direct" : "group";
  const to = scope === "direct" ? text(req.body.to) : undefined;
  if (scope === "direct" && (!to || !isActiveMember(project, to) || to === req.userId)) {
    return res.status(400).json({ message: "Selecciona un miembro para chat individual" });
  }

  const sender = await User.findById(req.userId).select("name email avatarColor");
  const senderName = sender?.name || "Usuario";
  project.messages.push({
    scope,
    to,
    author: req.userId,
    text: textValue,
  });
  project.messages = project.messages.slice(-300);
  appendActivity(project, req.userId, "chat", "envió un mensaje");
  await project.save();

  const recipients = scope === "group"
    ? activeMemberIds(project).filter((id) => id !== req.userId)
    : [to];

  await Promise.all(
    recipients.map((id) =>
      createProjectAlert({
        user: id,
        project,
        type: "message",
        title: scope === "group" ? `Mensaje en ${project.title}` : `Mensaje de ${senderName}`,
        body: `${senderName}: ${textValue.length > 90 ? `${textValue.slice(0, 87)}...` : textValue}`,
        data: {
          chat: scope,
          chatUserId: scope === "direct" ? String(req.userId) : "",
          authorId: String(req.userId),
          authorName: senderName,
        },
      })
    )
  );

  const populated = await populateProject(project);
  res.status(201).json({ project: serializeProject(populated, req.userId) });
}

export async function saveActivity(req, res) {
  const project = await findProjectForUser(req.params.id, req.userId);
  if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
  if (!isActiveMember(project, req.userId)) return res.json({ ok: true });

  const area = text(req.body.area, "proyecto");
  const action = text(req.body.action, "editando");
  const transientPresence = area.startsWith("chat:") || area.startsWith("view:");
  const cursorX = cursorValue(req.body.cursorX);
  const cursorY = cursorValue(req.body.cursorY);

  if (area === "chat:clear") {
    project.presence = project.presence.filter(
      (presence) => !sameId(presence.user, req.userId) || !String(presence.area || "").startsWith("chat:")
    );
    await project.save();
    return res.json({ ok: true });
  }

  const existing = project.presence.find((presence) => sameId(presence.user, req.userId));

  if (existing) {
    existing.area = area;
    existing.action = action;
    if (cursorX !== null) existing.cursorX = cursorX;
    if (cursorY !== null) existing.cursorY = cursorY;
    existing.updatedAt = new Date();
  } else {
    project.presence.push({ user: req.userId, area, action, cursorX, cursorY, updatedAt: new Date() });
  }

  if (!transientPresence) appendActivity(project, req.userId, area, action);
  await project.save();
  res.json({ ok: true });
}

export async function listFriends(req, res) {
  const user = await User.findById(req.userId)
    .select("friends")
    .populate("friends", "name email avatarColor");

  res.json({ items: (user?.friends || []).map(publicUser) });
}

export async function searchUsers(req, res) {
  const query = text(req.query.q);
  if (query.length < 2) return res.json({ items: [] });

  const users = await User.find({
    _id: { $ne: req.userId },
    $or: [
      { name: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } },
    ],
  }).select("name email avatarColor").limit(10);

  res.json({ items: users.map(publicUser) });
}

export async function addFriend(req, res) {
  const userIdValue = text(req.body.userId);
  const email = text(req.body.email).toLowerCase();
  const friend = userIdValue && isObjectId(userIdValue)
    ? await User.findById(userIdValue).select("name email avatarColor")
    : await User.findOne({ email }).select("name email avatarColor");

  if (!friend || sameId(friend._id, req.userId)) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  await User.findByIdAndUpdate(req.userId, { $addToSet: { friends: friend._id } });
  await User.findByIdAndUpdate(friend._id, { $addToSet: { friends: req.userId } });

  res.status(201).json({ friend: publicUser(friend) });
}

export async function listAlerts(req, res) {
  await cleanupOldAlerts();

  const query = { user: req.userId };
  const limit = alertLimit(req.query.limit);
  const [alerts, unreadCount, total] = await Promise.all([
    ProjectAlert.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("project", "title inviteCode")
      .lean(),
    ProjectAlert.countDocuments({ ...query, read: false }),
    ProjectAlert.countDocuments(query),
  ]);

  res.json({ items: alerts, unreadCount, total });
}

export async function markAlertRead(req, res) {
  await ProjectAlert.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { read: true }
  );

  res.json({ ok: true });
}

export async function deleteAlert(req, res) {
  await ProjectAlert.findOneAndDelete({ _id: req.params.id, user: req.userId });

  res.json({ ok: true });
}

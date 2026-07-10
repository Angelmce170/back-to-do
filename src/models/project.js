import mongoose from "mongoose";

const objectId = mongoose.Schema.Types.ObjectId;

const projectUserRef = {
  type: objectId,
  ref: "User",
};

const projectCommentSchema = new mongoose.Schema(
  {
    author: projectUserRef,
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectTaskNoteSchema = new mongoose.Schema(
  {
    author: projectUserRef,
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    assignedTo: projectUserRef,
    assignees: { type: [projectUserRef], default: [] },
    dueAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["Pendiente", "En Progreso", "Completada"],
      default: "Pendiente",
    },
    createdBy: projectUserRef,
    completedAt: { type: Date, default: null },
    overdueAlertSentAt: { type: Date, default: null },
    comments: { type: [projectCommentSchema], default: [] },
    notes: { type: [projectTaskNoteSchema], default: [] },
  },
  { timestamps: true }
);

const projectMessageSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["group", "direct"],
      default: "group",
    },
    to: projectUserRef,
    author: projectUserRef,
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectPresenceSchema = new mongoose.Schema(
  {
    user: projectUserRef,
    area: { type: String, default: "proyecto", trim: true },
    action: { type: String, default: "editando", trim: true },
    cursorX: { type: Number, default: null },
    cursorY: { type: Number, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectActivitySchema = new mongoose.Schema(
  {
    user: projectUserRef,
    text: { type: String, required: true, trim: true },
    area: { type: String, default: "proyecto", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    creator: { type: objectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    mode: {
      type: String,
      enum: ["individual", "group"],
      default: "individual",
    },
    participantLimit: { type: Number, default: 1, min: 1, max: 50 },
    inviteCode: { type: String, unique: true, sparse: true, index: true },
    attachment: {
      name: { type: String, default: "" },
      type: { type: String, default: "" },
      size: { type: Number, default: 0 },
      dataUrl: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },
    members: {
      type: [
        {
          user: projectUserRef,
          role: {
            type: String,
            enum: ["leader", "member"],
            default: "member",
          },
          status: {
            type: String,
            enum: ["active", "invited"],
            default: "invited",
          },
          invitedBy: projectUserRef,
          joinedAt: { type: Date, default: null },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    pendingEmails: {
      type: [
        {
          email: { type: String, trim: true, lowercase: true },
          invitedBy: projectUserRef,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    tasks: { type: [projectTaskSchema], default: [] },
    messages: { type: [projectMessageSchema], default: [] },
    presence: { type: [projectPresenceSchema], default: [] },
    activity: { type: [projectActivitySchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);

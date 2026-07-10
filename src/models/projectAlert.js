import mongoose from "mongoose";

const objectId = mongoose.Schema.Types.ObjectId;

const projectAlertSchema = new mongoose.Schema(
  {
    user: { type: objectId, ref: "User", required: true, index: true },
    project: { type: objectId, ref: "Project" },
    type: {
      type: String,
      enum: ["invite", "task", "completed", "message", "system"],
      default: "system",
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    read: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

projectAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 183 });

export default mongoose.model("ProjectAlert", projectAlertSchema);

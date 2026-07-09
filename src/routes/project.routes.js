import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
  acceptInvitation,
  addFriend,
  addTaskComment,
  createProject,
  createProjectTask,
  inviteByEmail,
  inviteFriends,
  joinByCode,
  listAlerts,
  listFriends,
  listProjects,
  markAlertRead,
  projectDetails,
  saveActivity,
  searchUsers,
  sendProjectMessage,
  updateProject,
  updateProjectTask,
} from "../controllers/project.controller.js";

const router = Router();

router.use(auth);

router.get("/friends/search", searchUsers);
router.get("/friends", listFriends);
router.post("/friends", addFriend);

router.get("/alerts", listAlerts);
router.patch("/alerts/:id/read", markAlertRead);

router.post("/join/:code", joinByCode);
router.get("/", listProjects);
router.post("/", createProject);
router.get("/:id", projectDetails);
router.put("/:id", updateProject);
router.post("/:id/accept", acceptInvitation);
router.post("/:id/invite-email", inviteByEmail);
router.post("/:id/invite-friends", inviteFriends);
router.post("/:id/tasks", createProjectTask);
router.patch("/:id/tasks/:taskId", updateProjectTask);
router.post("/:id/tasks/:taskId/comments", addTaskComment);
router.post("/:id/messages", sendProjectMessage);
router.post("/:id/activity", saveActivity);

export default router;

import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { cronStatus, deleteToken, saveToken, sendDueReminders } from "../controllers/notification.controller.js";

const router = Router();

router.get("/cron/send-due", sendDueReminders);
router.post("/cron/send-due", sendDueReminders);
router.get("/cron/:secret/status", cronStatus);
router.get("/cron/:secret", sendDueReminders);
router.post("/send-due", auth, sendDueReminders);
router.post("/token", auth, saveToken);
router.delete("/token", auth, deleteToken);

export default router;

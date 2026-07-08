import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
  cronStatus,
  deleteSubscription,
  publicKey,
  saveSubscription,
  sendDueReminders,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/cron/send-due", sendDueReminders);
router.post("/cron/send-due", sendDueReminders);
router.get("/cron/:secret/status", cronStatus);
router.get("/cron/:secret", sendDueReminders);
router.get("/public-key", publicKey);
router.post("/send-due", auth, sendDueReminders);
router.post("/subscription", auth, saveSubscription);
router.delete("/subscription", auth, deleteSubscription);

export default router;

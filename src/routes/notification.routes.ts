import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
  archiveAllNotifications,
} from "../controllers/notification.controller.js";

const router = Router();

// Get all notifications for authenticated user
router.get("/", authenticateToken, getUserNotifications);

// Get unread count
router.get("/unread-count", authenticateToken, getUnreadCount);

// Mark a specific notification as read
router.put("/:notificationId/read", authenticateToken, markNotificationAsRead);

// Mark all notifications as read
router.put("/read-all", authenticateToken, markAllNotificationsAsRead);

// Archive all notifications
router.put("/archive-all", authenticateToken, archiveAllNotifications);

// Delete a notification
router.delete("/:notificationId", authenticateToken, deleteNotification);

export default router;

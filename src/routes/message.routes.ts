import {
    createNormalConversation,
    createNegotiableConversation,
    createBuyConversation,
    getConversations,
    getConversation,
    getMessages,
    sendMessage,
    markMessagesAsRead,
    uploadChatImage
} from "../controllers/message.controller.js";
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import multer from "multer";


// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

const router = Router();

router.post("/create-normal-conversation", authenticateToken, createNormalConversation);
router.post("/create-negotiable-conversation", authenticateToken, createNegotiableConversation);
router.post("/create-buy-conversation", authenticateToken, createBuyConversation);
router.get("/get-conversations", authenticateToken, getConversations);
router.get("/get-conversation/:conversationId", authenticateToken, getConversation);
router.get("/get-messages/:conversationId", authenticateToken, getMessages);
router.post("/send-message", authenticateToken, sendMessage);
router.post("/mark-messages-as-read/:conversationId", authenticateToken, markMessagesAsRead);
router.post("/upload-chat-image", authenticateToken, upload.single("image"), uploadChatImage);

export default router;
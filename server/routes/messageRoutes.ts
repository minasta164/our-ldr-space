import { Router } from "express";
import { messageService } from "../services/messageService.js";
import { asyncWrapper } from "../middleware/errorHandler.js";
import { validate } from "../middleware/auth.js";

const router = Router();

router.get("/", asyncWrapper(async (req: any, res: any) => {
  const messages = messageService.getMessages();
  res.json(messages);
}));

router.post("/", 
  validate({
    sender: { type: "string", required: true },
    text: { type: "string", required: false },
    voiceUrl: { type: "string", required: false },
    uuid: { type: "string", required: false },
    attachmentUrl: { type: "string", required: false },
    attachmentName: { type: "string", required: false },
    attachmentType: { type: "string", required: false },
    attachmentSize: { type: "number", required: false }
  }),
  asyncWrapper(async (req: any, res: any) => {
    const { sender, text, voiceUrl, uuid, attachmentUrl, attachmentName, attachmentType, attachmentSize } = req.body;
    const newMessage = messageService.createMessage(
      sender, 
      text, 
      voiceUrl, 
      uuid, 
      attachmentUrl, 
      attachmentName, 
      attachmentType, 
      attachmentSize
    );
    res.json(newMessage);
  })
);

router.post("/read", 
  validate({
    username: { type: "string", required: true }
  }),
  asyncWrapper(async (req: any, res: any) => {
    const { username } = req.body;
    messageService.markAsRead(username);
    res.json({ success: true });
  })
);

router.delete("/:id", asyncWrapper(async (req: any, res: any) => {
  const { id } = req.params;
  messageService.deleteMessage(parseInt(id));
  res.json({ success: true });
}));

export default router;

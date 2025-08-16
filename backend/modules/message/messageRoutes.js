import express from 'express';
import messageController from '../message/messageController.js';

const router = express.Router();

router.post('/messages/sendMessage', messageController.sendMessage);
router.post('/messages/sendDirectMessage', messageController.sendDirectMessage);

export default router;
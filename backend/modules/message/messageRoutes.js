import express from 'express';
import messageController from '../message/messageController.js';

const router = express.Router();

router.post('/messages/sendMessage', (req, res) => {
  messageController.sendMessage(req, res);
});

router.post('/messages/sendDirectMessage', (req, res) => {
  messageController.sendDirectMessage(req, res);
});

export default router;
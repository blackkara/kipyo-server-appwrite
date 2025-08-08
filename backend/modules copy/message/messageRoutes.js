import express from 'express';
import messageController from '../message/messageController.js';

const router = express.Router();

router.post('/messages/new', messageController.sendMessage);

export default router;
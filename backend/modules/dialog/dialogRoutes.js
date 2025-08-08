import express from 'express';
import dialogController from '../dialog/dialogController.js';

const router = express.Router();

router.post('/dialogs/init', dialogController.initDialog);

export default router;
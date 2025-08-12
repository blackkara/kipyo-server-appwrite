import express from 'express';
import dialogController from './dialogController.js';
import { createDirectDialogValidation, initDialogValidation } from './dialogValidator.js';

const router = express.Router();

router.post('/dialogs/init', initDialogValidation, dialogController.initDialog);
router.post('/dialogs/direct', createDirectDialogValidation, dialogController.createDirectDialog);

export default router;
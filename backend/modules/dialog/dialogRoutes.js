import express from 'express';
import dialogController from './dialogController.js';
import { createDirectDialogValidation, initDialogValidation } from './dialogValidator.js';

const router = express.Router();

router.post('/dialogs/init', initDialogValidation, dialogController.initDialog);
router.post('/dialogs/direct', createDirectDialogValidation, dialogController.createDirectDialog);
router.post('/dialogs/delete', dialogController.deleteDialog);
router.post('/dialogs/allow-media', dialogController.allowMedia);

export default router;
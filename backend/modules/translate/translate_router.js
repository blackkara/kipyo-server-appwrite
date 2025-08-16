import express from 'express';
import translateController from './translateController.js';
//import { createDirectDialogValidation, initDialogValidation } from './dialogValidator.js';

const router = express.Router();

router.post('/translate/message', translateController.initDialog);
router.post('/dialogs/direct', dialogController.createDirectDialog);

export default router;
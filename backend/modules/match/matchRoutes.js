import express from 'express';
import matchController from './matchController.js';

const router = express.Router();

router.post('/matches/unmatch', (req, res) => {
  matchController.unmatch(req, res);
});

export default router;
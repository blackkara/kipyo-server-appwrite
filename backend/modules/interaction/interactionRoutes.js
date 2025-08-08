import express from 'express';
import interactionController from './interactionController.js';

const router = express.Router();

router.post('/interactions/block', (req, res) => {
  interactionController.blockUser(req, res);
});

router.post('/interactions/unblock', (req, res) => {
  interactionController.unblockUser(req, res);
});

router.post('/interactions/mute', (req, res) => {
  interactionController.muteUser(req, res);
});

router.post('/interactions/unmute', (req, res) => {
  interactionController.unmuteUser(req, res);
});

router.post('/interactions/like', (req, res) => {
  interactionController.likeUser(req, res);
});

router.post('/interactions/dislike', (req, res) => {
  interactionController.dislikeUser(req, res);
});

router.post('/interactions/all', (req, res) => {
  interactionController.getAllInteractions(req, res);
});

router.post('/interactions/unmatch', (req, res) => {
  interactionController.unmatch(req, res);
});

export default router;
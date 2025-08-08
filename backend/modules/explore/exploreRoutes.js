import express from 'express';
import exploreController from '../explore/exploreController.js';

const router = express.Router();

router.get('/explore/cards',  (req, res) => {
  exploreController.getCards(req, res);
});


export default router;
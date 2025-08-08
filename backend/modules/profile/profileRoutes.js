import express from 'express';
import profileController from './profileController.js';

const router = express.Router();

router.post('/profile/get', (req, res) => {
  profileController.getProfile(req, res);
});

router.post('/profile/update', (req, res) => {
  profileController.updateProfile(req, res);
});

router.post('/profile/upload-photo', (req, res) => {
  profileController.uploadPhoto(req, res);
});

router.post('/profile/delete-photo', (req, res) => {
  profileController.deletePhoto(req, res);
});

export default router;
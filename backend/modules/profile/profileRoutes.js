import express from 'express';
import profileController from './profileController.js';

const router = express.Router();

// Mevcut endpoint'ler
router.post('/profile/create', (req, res) => {
  profileController.createProfile(req, res);
});

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

// Yeni partial update endpoint'leri
router.patch('/profile/about', (req, res) => {
  profileController.updateAbout(req, res);
});

router.patch('/profile/passions', (req, res) => {
  profileController.updatePassions(req, res);
});

router.patch('/profile/relation-goal', (req, res) => {
  profileController.updateRelationGoal(req, res);
});

router.patch('/profile/personal-info', (req, res) => {
  profileController.updatePersonalInfo(req, res);
});

router.patch('/profile/gender', (req, res) => {
  profileController.updateGender(req, res);
});

router.patch('/profile/birth-date', (req, res) => {
  profileController.updateBirthDate(req, res);
});

// Preferences için ayrı endpoint'ler (opsiyonel)
router.patch('/profile/habits', (req, res) => {
  profileController.updateHabits(req, res);
});

export default router;
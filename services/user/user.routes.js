const express = require('express');
const { protect } = require('../../middleware/auth');
const { getProfile, updateProfile, getDashboard, uploadAvatar } = require('./user.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/v1/users/profile
router.get('/profile', getProfile);

// PUT  /api/v1/users/profile
router.put('/profile', updateProfile);

// GET  /api/v1/users/dashboard
router.get('/dashboard', getDashboard);

// POST /api/v1/users/avatar
router.post('/avatar', uploadAvatar);

module.exports = router;

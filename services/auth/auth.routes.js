const express = require('express');
const { body } = require('express-validator');
const { register, login, logout, refreshToken, forgotPassword, resetPassword } = require('./auth.controller');

const router = express.Router();

// POST /api/v1/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['student', 'instructor']).withMessage('Role must be student or instructor')
  ],
  register
);

// POST /api/v1/auth/login
router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
  ],
  login
);

// POST /api/v1/auth/logout
router.post('/logout', logout);

// POST /api/v1/auth/refresh-token
router.post('/refresh-token', refreshToken);

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  forgotPassword
);

// POST /api/v1/auth/reset-password/:token
router.post(
  '/reset-password/:token',
  [body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  resetPassword
);

module.exports = router;

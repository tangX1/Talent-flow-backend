const express = require('express');
const { protect } = require('../../middleware/auth');
const {
  generateCertificate,
  getCertificate,
  getUserCertificates,
  verifyCertificate
} = require('./certificate.controller');

const router = express.Router();

// GET /api/v1/certificates/verify/:certificateId — Public route (no auth needed)
router.get('/verify/:certificateId', verifyCertificate);

// Protected routes below
router.use(protect);

// POST /api/v1/certificates/generate
router.post('/generate', generateCertificate);

// GET  /api/v1/certificates/user/:userId
router.get('/user/:userId', getUserCertificates);

// GET  /api/v1/certificates/:certificateId
router.get('/:certificateId', getCertificate);

module.exports = router;

const express = require('express');
const { protect } = require('../../middleware/auth');
const {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  getTeamMembers
} = require('./team.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/v1/teams
router.get('/', getTeams);

// POST /api/v1/teams
router.post('/', createTeam);

// GET  /api/v1/teams/:id
router.get('/:id', getTeamById);

// PUT  /api/v1/teams/:id
router.put('/:id', updateTeam);

// DELETE /api/v1/teams/:id
router.delete('/:id', deleteTeam);

// GET  /api/v1/teams/:id/members
router.get('/:id/members', getTeamMembers);

// POST /api/v1/teams/:id/members
router.post('/:id/members', addMember);

// DELETE /api/v1/teams/:id/members/:userId
router.delete('/:id/members/:userId', removeMember);

module.exports = router;

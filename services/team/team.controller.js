const TeamModel = require('./team.model');
const { supabase } = require('../../config/database');
const { createNotification } = require('../notification/notification.controller');
const { logAction } = require('../analytics/analytics.controller');

// POST /api/v1/teams
const createTeam = async (req, res, next) => {
  try {
    const { name, description, courseId, maxMembers } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Team name is required.' });
    }

    const team = await TeamModel.create({
      name,
      description: description || '',
      course_id: courseId || null,
      created_by: req.user.id,
      max_members: maxMembers || 10,
      is_active: true
    });

    // Add creator as leader
    await TeamModel.addMember(team.id, req.user.id, 'leader');

    await logAction(req.user.id, 'CREATE_TEAM', 'Team', team.id, { name });

    const teamWithMembers = await TeamModel.findByIdWithMembers(team.id);

    res.status(201).json({
      success: true,
      message: 'Team created successfully.',
      data: { team: teamWithMembers }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/teams
const getTeams = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, courseId, search, isActive } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    if (req.user.role !== 'admin') {
      // Fetch teams user created or is a member of
      const memberTeamIds = await TeamModel.getUserTeamIds(req.user.id);

      let query = supabase
        .from('teams')
        .select('*', { count: 'exact' });

      // Build OR condition: created_by = user OR id in memberTeamIds
      if (memberTeamIds.length > 0) {
        query = query.or(`created_by.eq.${req.user.id},id.in.(${memberTeamIds.join(',')})`);
      } else {
        query = query.eq('created_by', req.user.id);
      }

      if (courseId) query = query.eq('course_id', courseId);
      if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
      if (search) query = query.ilike('name', `%${search}%`);

      query = query.order('created_at', { ascending: false }).range(skip, skip + limitNum - 1);

      const { data: teams, count, error } = await query;
      if (error) return next(error);

      const total = count || 0;

      // Enrich with member counts
      const enriched = await Promise.all((teams || []).map(async (t) => {
        const memberCount = await TeamModel.countMembers(t.id);
        return { ...t, memberCount };
      }));

      return res.status(200).json({
        success: true,
        data: {
          teams: enriched,
          pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        }
      });
    }

    // Admin: fetch all with optional filters
    const filters = {};
    if (courseId) filters.course_id = courseId;
    if (isActive !== undefined) filters.is_active = isActive === 'true';
    if (search) filters.search = search;

    const { data: teams, count } = await TeamModel.findAll(filters, { skip, limit: limitNum });
    const total = count || 0;

    const enriched = await Promise.all((teams || []).map(async (t) => {
      const memberCount = await TeamModel.countMembers(t.id);
      return { ...t, memberCount };
    }));

    res.status(200).json({
      success: true,
      data: {
        teams: enriched,
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/teams/:id
const getTeamById = async (req, res, next) => {
  try {
    const team = await TeamModel.findByIdWithMembers(req.params.id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    const isMember = team.members.some(m => m.user_id === req.user.id);
    if (!isMember && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. You are not a member of this team.' });
    }

    res.status(200).json({
      success: true,
      data: { team }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/teams/:id
const updateTeam = async (req, res, next) => {
  try {
    const team = await TeamModel.findByIdWithMembers(req.params.id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    const isLeader = team.members.some(m => m.user_id === req.user.id && m.role === 'leader');

    if (!isLeader && team.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the team leader can update this team.' });
    }

    const allowed = ['name', 'description', 'max_members', 'is_active'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updatedTeam = await TeamModel.update(req.params.id, updates);
    const members = await TeamModel.getMembers(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Team updated successfully.',
      data: { team: { ...updatedTeam, members } }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/teams/:id
const deleteTeam = async (req, res, next) => {
  try {
    const team = await TeamModel.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    if (team.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the team creator or admin can delete this team.' });
    }

    await TeamModel.remove(req.params.id);

    await logAction(req.user.id, 'DELETE_TEAM', 'Team', team.id, { name: team.name });

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/teams/:id/members
const addMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    const team = await TeamModel.findByIdWithMembers(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    const isLeader = team.members.some(m => m.user_id === req.user.id && m.role === 'leader');

    if (!isLeader && team.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the team leader can add members.' });
    }

    const memberCount = await TeamModel.countMembers(team.id);
    if (memberCount >= (team.max_members || 10)) {
      return res.status(400).json({ success: false, message: `Team is full. Maximum ${team.max_members || 10} members allowed.` });
    }

    const alreadyMember = await TeamModel.getMember(team.id, userId);
    if (alreadyMember) {
      return res.status(409).json({ success: false, message: 'User is already a member of this team.' });
    }

    const { data: userToAdd } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', userId)
      .single();

    if (!userToAdd) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await TeamModel.addMember(team.id, userId, role || 'member');

    createNotification(
      userId,
      'team_invite',
      'Team Invitation',
      `You have been added to the team "${team.name}".`,
      { teamId: team.id }
    ).catch(err => console.error('Notification error:', err.message));

    const updatedMembers = await TeamModel.getMembers(team.id);

    res.status(200).json({
      success: true,
      message: 'Member added successfully.',
      data: { team: { ...team, members: updatedMembers } }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/teams/:id/members/:userId
const removeMember = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const team = await TeamModel.findByIdWithMembers(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    const isLeader = team.members.some(m => m.user_id === req.user.id && m.role === 'leader');
    const isSelf = req.user.id === userId;

    if (!isLeader && !isSelf && team.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to remove this member.' });
    }

    const memberToRemove = team.members.find(m => m.user_id === userId);
    if (!memberToRemove) {
      return res.status(404).json({ success: false, message: 'Member not found in this team.' });
    }

    if (memberToRemove.role === 'leader') {
      const leaderCount = await TeamModel.getLeaderCount(id);
      if (leaderCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot remove the only team leader. Assign another leader first.' });
      }
    }

    await TeamModel.removeMember(id, userId);

    res.status(200).json({
      success: true,
      message: 'Member removed successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/teams/:id/members
const getTeamMembers = async (req, res, next) => {
  try {
    const team = await TeamModel.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found.' });
    }

    const members = await TeamModel.getMembers(req.params.id);

    const isMember = members.some(m => m.user_id === req.user.id);
    if (!isMember && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.status(200).json({
      success: true,
      data: {
        members,
        total: members.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createTeam, getTeams, getTeamById, updateTeam, deleteTeam, addMember, removeMember, getTeamMembers };

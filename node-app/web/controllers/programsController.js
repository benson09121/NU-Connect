const programsModel = require('../models/programsModel');
const logModel = require('../models/logModel'); // kept for backward-compat if referenced elsewhere
const { subscribeToChannel, publishToChannel } = require('./sseController');

const CHANNELS = {
  PROGRAMS: 'programs_updates',
  COLLEGES: 'colleges_updates',
};

// GET /programs?sessionId=...
async function getAllPrograms(req, res) {
  const { sessionId } = req.query;
  try {
    const programs = await programsModel.getAllPrograms();

    if (sessionId) {
      // subscribe caller to real-time program updates
      subscribeToChannel(sessionId, CHANNELS.PROGRAMS);
    }

    // consistent envelope ({ data }) for SSE bootstrap
    res.json({ success: true, data: programs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while fetching programs.',
    });
  }
}

// GET /programs/colleges?sessionId=...
async function getAllColleges(req, res) {
  const { sessionId } = req.query;
  try {
    const colleges = await programsModel.getAllColleges();

    if (sessionId) {
      // subscribe caller to real-time college updates
      subscribeToChannel(sessionId, CHANNELS.COLLEGES);
    }

    // consistent envelope ({ data }) for SSE bootstrap
    res.json({ success: true, data: colleges });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while fetching colleges.',
    });
  }
}

// POST /programs
async function createProgram(req, res) {
  const { college_id, name, abbreviation } = req.body;
  const email = req.user?.email || req.body.email;

  try {
    // validations
    if (!college_id) return res.status(400).json({ success: false, error: 'Please select a college.' });
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Program name is required.' });
    if (!abbreviation?.trim()) return res.status(400).json({ success: false, error: 'Program abbreviation is required.' });
    if (!email) return res.status(400).json({ success: false, error: 'User authentication required.' });

    const program = await programsModel.createProgram(college_id, name, abbreviation, email);

    // broadcast to all subscribers
    publishToChannel(CHANNELS.PROGRAMS, {
      operation: 'CREATE',
      data: program,
      user: email,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Program created successfully.',
      data: program,
    });
  } catch (error) {
    console.error('[createProgram] Error:', error);
    let message = 'An error occurred while creating the program.';
    let statusCode = 400;

    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('program_name')) message = 'A program with this name already exists in the selected college.';
      else if (error.message.includes('program_abbreviation')) message = 'A program with this abbreviation already exists.';
      else message = 'A program with this name or abbreviation already exists.';
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      message = error.message.includes('college')
        ? 'The selected college does not exist. Please refresh and try again.'
        : 'Invalid reference data. Please refresh and try again.';
    } else if (error.code === 'ER_BAD_NULL_VALUE') {
      message = 'Required information is missing. Please fill in all required fields.';
    } else if (error.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes('program name or abbreviation already exists')) message = 'A program with this name or abbreviation already exists.';
      else if (msg.includes('user not found for provided email')) { message = 'User authentication failed. Please log in again.'; statusCode = 401; }
      else if (msg.includes('college not found')) message = 'The selected college does not exist. Please refresh and try again.';
      else if (msg.includes('cannot create program under an archived college')) message = 'Cannot create a program under an archived college. Please select an active college.';
      else if (msg.includes('permission') || msg.includes('not authorized')) { message = 'You do not have permission to create programs.'; statusCode = 403; }
    }

    res.status(statusCode).json({ success: false, error: message });
  }
}

// PUT /programs
async function updateProgram(req, res) {
  const { program_id, college_id, name, abbreviation } = req.body;
  const email = req.user?.email || req.body.email;

  try {
    // validations
    if (!program_id) return res.status(400).json({ success: false, error: 'Program ID is required.' });
    if (!college_id) return res.status(400).json({ success: false, error: 'Please select a college.' });
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Program name is required.' });
    if (!abbreviation?.trim()) return res.status(400).json({ success: false, error: 'Program abbreviation is required.' });
    if (!email) return res.status(400).json({ success: false, error: 'User authentication required.' });

    const program = await programsModel.updateProgram(program_id, college_id, name, abbreviation, email);

    publishToChannel(CHANNELS.PROGRAMS, {
      operation: 'UPDATE',
      data: program,
      user: email,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Program updated successfully.',
      data: program,
    });
  } catch (error) {
    console.error('[updateProgram] Error:', error);
    let message = 'An error occurred while updating the program.';
    let statusCode = 400;

    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('program_name')) message = 'A program with this name already exists in the selected college.';
      else if (error.message.includes('program_abbreviation')) message = 'A program with this abbreviation already exists.';
      else message = 'A program with this name or abbreviation already exists.';
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      message = error.message.includes('college')
        ? 'The selected college does not exist. Please refresh and try again.'
        : 'Invalid reference data. Please refresh and try again.';
    } else if (error.code === 'ER_BAD_NULL_VALUE') {
      message = 'Required information is missing. Please fill in all required fields.';
    } else if (error.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes('program name or abbreviation already exists')) message = 'A program with this name or abbreviation already exists.';
      else if (msg.includes('user not found for provided email')) { message = 'User authentication failed. Please log in again.'; statusCode = 401; }
      else if (msg.includes('program not found')) { message = 'The program you are trying to update does not exist or may have been deleted.'; statusCode = 404; }
      else if (msg.includes('college not found')) message = 'The selected college does not exist. Please refresh and try again.';
      else if (msg.includes('cannot move program into an archived college')) message = 'Cannot move a program to an archived college. Please select an active college.';
      else if (msg.includes('permission') || msg.includes('not authorized')) { message = 'You do not have permission to update this program.'; statusCode = 403; }
    }

    res.status(statusCode).json({ success: false, error: message });
  }
}

// POST /programs/archive
async function archiveProgram(req, res) {
  const { program_id, reason } = req.body;
  const email = req.user?.email || req.body.email;
  try {
    const program = await programsModel.archiveProgram(program_id, email, reason);

    publishToChannel(CHANNELS.PROGRAMS, {
      operation: 'ARCHIVE',
      data: program,
      user: email,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Program archived successfully.',
      data: program,
    });
  } catch (error) {
    console.error('[archiveProgram] Error:', error);
    let message = error.message || 'An error occurred while archiving the program.';
    if (message.includes('already archived')) message = 'This program is already archived.';
    else if (message.includes('Program not found')) message = 'The program you are trying to archive does not exist.';
    res.status(400).json({ success: false, error: message });
  }
}

// POST /programs/unarchive
async function unarchiveProgram(req, res) {
  const { program_id } = req.body;
  const email = req.user?.email || req.body.email;
  try {
    const program = await programsModel.unarchiveProgram(program_id, email);

    publishToChannel(CHANNELS.PROGRAMS, {
      operation: 'UNARCHIVE',
      data: program,
      user: email,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Program unarchived successfully.',
      data: program,
    });
  } catch (error) {
    console.error('[unarchiveProgram] Error:', error);
    let message = error.message || 'An error occurred while unarchiving the program.';
    if (message.includes('not archived')) message = 'This program is not archived.';
    else if (message.includes('Program not found')) message = 'The program you are trying to unarchive does not exist.';
    res.status(400).json({ success: false, error: message });
  }
}

// DELETE /programs (soft delete/archive)
async function deleteProgram(req, res) {
  const { program_id } = req.body;
  const email = req.user?.email || req.body.email;
  try {
    const result = await programsModel.deleteProgram(program_id, email);

    publishToChannel(CHANNELS.PROGRAMS, {
      operation: 'DELETE',
      data: { program_id },
      user: email,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Program deleted (archived) successfully.',
      data: result,
    });
  } catch (error) {
    console.error('[deleteProgram] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while deleting the program.',
    });
  }
}

module.exports = {
  getAllPrograms,
  getAllColleges,
  createProgram,
  updateProgram,
  deleteProgram,
  archiveProgram,
  unarchiveProgram,
};

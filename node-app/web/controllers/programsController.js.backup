const programsModel = require('../models/programsModel');
const logModel = require('../models/logModel'); // kept for backward-compat if referenced elsewhere
const { subscribeToChannel, publishToChannel } = require('./sseController');

const CHANNELS = {
  PROGRAMS: 'programs_updates',
  COLLEGES: 'colleges_updates',
};

// Enhanced error handler with detailed logging
const handleError = (operation, error, res, defaultStatus = 500) => {
  console.error(`[${operation}] Error:`, error);
  
  let message = `An error occurred while ${operation.toLowerCase()}.`;
  let statusCode = defaultStatus;

  // Handle specific database errors
  if (error.code === 'ER_DUP_ENTRY') {
    statusCode = 409; // Conflict
    if (error.message.includes('program_name')) {
      message = 'A program with this name already exists in the selected college.';
    } else if (error.message.includes('program_abbreviation')) {
      message = 'A program with this abbreviation already exists.';
    } else {
      message = 'A program with this name or abbreviation already exists.';
    }
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = error.message.includes('college')
      ? 'The selected college does not exist. Please refresh and try again.'
      : 'Invalid reference data. Please refresh and try again.';
  } else if (error.code === 'ER_BAD_NULL_VALUE') {
    statusCode = 400;
    message = 'Required information is missing. Please fill in all required fields.';
  } else if (error.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes('program name or abbreviation already exists')) {
      statusCode = 409;
      message = 'A program with this name or abbreviation already exists.';
    } else if (msg.includes('user not found for provided email')) {
      statusCode = 401;
      message = 'User authentication failed. Please log in again.';
    } else if (msg.includes('program not found')) {
      statusCode = 404;
      message = 'The program you are trying to access does not exist or may have been deleted.';
    } else if (msg.includes('college not found')) {
      statusCode = 400;
      message = 'The selected college does not exist. Please refresh and try again.';
    } else if (msg.includes('cannot create program under an archived college')) {
      statusCode = 400;
      message = 'Cannot create a program under an archived college. Please select an active college.';
    } else if (msg.includes('cannot move program into an archived college')) {
      statusCode = 400;
      message = 'Cannot move a program to an archived college. Please select an active college.';
    } else if (msg.includes('permission') || msg.includes('not authorized')) {
      statusCode = 403;
      message = 'You do not have permission to perform this action.';
    } else if (msg.includes('already archived')) {
      statusCode = 409;
      message = 'This program is already archived.';
    } else if (msg.includes('not archived')) {
      statusCode = 409;
      message = 'This program is not archived.';
    } else {
      message = error.message;
    }
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
};

// Enhanced broadcast helper with retry logic
const broadcastUpdate = async (channel, operation, data, email, retryCount = 0) => {
  const maxRetries = 3;
  
  try {
    await publishToChannel(channel, {
      operation,
      data,
      user: email,
      timestamp: new Date().toISOString(),
      version: Date.now(), // Add version for deduplication
    });
    
    console.log(`[SSE] Broadcasted ${operation} to ${channel}:`, data?.program_id || data?.id);
  } catch (broadcastError) {
    console.error(`[SSE] Broadcast failed for ${operation} on ${channel}:`, broadcastError);
    
    // Retry logic for critical operations
    if (retryCount < maxRetries && ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'UNARCHIVE'].includes(operation)) {
      console.log(`[SSE] Retrying broadcast ${retryCount + 1}/${maxRetries}...`);
      setTimeout(() => {
        broadcastUpdate(channel, operation, data, email, retryCount + 1);
      }, 1000 * (retryCount + 1));
    }
  }
};

// GET /programs?sessionId=...
async function getAllPrograms(req, res) {
  const { sessionId } = req.query;
  
  try {
    console.log('[Programs] Fetching all programs', { sessionId });
    const programs = await programsModel.getAllPrograms();

    if (sessionId) {
      // Subscribe caller to real-time program updates
      console.log(`[SSE] Subscribing session ${sessionId} to ${CHANNELS.PROGRAMS}`);
      await subscribeToChannel(sessionId, CHANNELS.PROGRAMS);
    }

    // Enhanced response with metadata
    res.json({
      success: true,
      data: programs,
      meta: {
        total: programs.length,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || null,
      },
    });
    
    console.log(`[Programs] Returned ${programs.length} programs to session ${sessionId || 'none'}`);
  } catch (error) {
    handleError('fetching programs', error, res);
  }
}

// GET /programs/colleges?sessionId=...
async function getAllColleges(req, res) {
  const { sessionId } = req.query;
  
  try {
    console.log('[Colleges] Fetching all colleges', { sessionId });
    const colleges = await programsModel.getAllColleges();

    if (sessionId) {
      // Subscribe caller to real-time college updates
      console.log(`[SSE] Subscribing session ${sessionId} to ${CHANNELS.COLLEGES}`);
      await subscribeToChannel(sessionId, CHANNELS.COLLEGES);
    }

    // Enhanced response with metadata
    res.json({
      success: true,
      data: colleges,
      meta: {
        total: colleges.length,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || null,
      },
    });
    
    console.log(`[Colleges] Returned ${colleges.length} colleges to session ${sessionId || 'none'}`);
  } catch (error) {
    handleError('fetching colleges', error, res);
  }
}

// Enhanced validation helper
const validateProgramData = (data, isUpdate = false) => {
  const errors = [];
  
  if (isUpdate && !data.program_id) {
    errors.push('Program ID is required for updates.');
  }
  
  if (!data.college_id) {
    errors.push('Please select a college.');
  } else if (isNaN(parseInt(data.college_id))) {
    errors.push('Invalid college selection.');
  }
  
  if (!data.name || !data.name.trim()) {
    errors.push('Program name is required.');
  } else if (data.name.trim().length < 3) {
    errors.push('Program name must be at least 3 characters long.');
  } else if (data.name.trim().length > 255) {
    errors.push('Program name is too long (maximum 255 characters).');
  }
  
  if (!data.abbreviation || !data.abbreviation.trim()) {
    errors.push('Program abbreviation is required.');
  } else if (data.abbreviation.trim().length < 2) {
    errors.push('Program abbreviation must be at least 2 characters long.');
  } else if (data.abbreviation.trim().length > 20) {
    errors.push('Program abbreviation is too long (maximum 20 characters).');
  }
  
  if (!data.email) {
    errors.push('User authentication required.');
  }
  
  return errors;
};

// POST /programs
async function createProgram(req, res) {
  const { college_id, name, abbreviation } = req.body;
  const email = req.user?.email || req.body.email;

  try {
    console.log('[Programs] Creating program:', { college_id, name, abbreviation, email });
    
    // Enhanced validation
    const validationErrors = validateProgramData({ college_id, name, abbreviation, email });
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(' '),
        validationErrors,
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      college_id: parseInt(college_id),
      name: name.trim(),
      abbreviation: abbreviation.trim().toUpperCase(),
      email: email.trim(),
    };

    const program = await programsModel.createProgram(
      sanitizedData.college_id,
      sanitizedData.name,
      sanitizedData.abbreviation,
      sanitizedData.email
    );

    // Enhanced broadcast with retry
    await broadcastUpdate(CHANNELS.PROGRAMS, 'CREATE', program, email);

    console.log('[Programs] Program created successfully:', program.program_id);

    res.status(201).json({
      success: true,
      message: 'Program created successfully.',
      data: program,
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'CREATE',
      },
    });
  } catch (error) {
    handleError('creating the program', error, res, 400);
  }
}

// PUT /programs
async function updateProgram(req, res) {
  const { program_id, college_id, name, abbreviation } = req.body;
  const email = req.user?.email || req.body.email;

  try {
    console.log('[Programs] Updating program:', { program_id, college_id, name, abbreviation, email });
    
    // Enhanced validation
    const validationErrors = validateProgramData({ program_id, college_id, name, abbreviation, email }, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(' '),
        validationErrors,
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      program_id: parseInt(program_id),
      college_id: parseInt(college_id),
      name: name.trim(),
      abbreviation: abbreviation.trim().toUpperCase(),
      email: email.trim(),
    };

    const program = await programsModel.updateProgram(
      sanitizedData.program_id,
      sanitizedData.college_id,
      sanitizedData.name,
      sanitizedData.abbreviation,
      sanitizedData.email
    );

    // Enhanced broadcast with retry
    await broadcastUpdate(CHANNELS.PROGRAMS, 'UPDATE', program, email);

    console.log('[Programs] Program updated successfully:', program.program_id);

    res.status(200).json({
      success: true,
      message: 'Program updated successfully.',
      data: program,
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'UPDATE',
      },
    });
  } catch (error) {
    handleError('updating the program', error, res, 400);
  }
}

// POST /programs/archive
async function archiveProgram(req, res) {
  const { program_id, reason } = req.body;
  const email = req.user?.email || req.body.email;
  
  try {
    console.log('[Programs] Archiving program:', { program_id, reason, email });
    
    // Basic validation
    if (!program_id) {
      return res.status(400).json({
        success: false,
        error: 'Program ID is required.',
      });
    }
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'User authentication required.',
      });
    }

    const program = await programsModel.archiveProgram(parseInt(program_id), email.trim(), reason?.trim() || '');

    // Enhanced broadcast with retry
    await broadcastUpdate(CHANNELS.PROGRAMS, 'ARCHIVE', program, email);

    console.log('[Programs] Program archived successfully:', program.program_id);

    res.status(200).json({
      success: true,
      message: 'Program archived successfully.',
      data: program,
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'ARCHIVE',
      },
    });
  } catch (error) {
    handleError('archiving the program', error, res, 400);
  }
}

// POST /programs/unarchive
async function unarchiveProgram(req, res) {
  const { program_id } = req.body;
  const email = req.user?.email || req.body.email;
  
  try {
    console.log('[Programs] Unarchiving program:', { program_id, email });
    
    // Basic validation
    if (!program_id) {
      return res.status(400).json({
        success: false,
        error: 'Program ID is required.',
      });
    }
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'User authentication required.',
      });
    }

    const program = await programsModel.unarchiveProgram(parseInt(program_id), email.trim());

    // Enhanced broadcast with retry
    await broadcastUpdate(CHANNELS.PROGRAMS, 'UNARCHIVE', program, email);

    console.log('[Programs] Program unarchived successfully:', program.program_id);

    res.status(200).json({
      success: true,
      message: 'Program unarchived successfully.',
      data: program,
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'UNARCHIVE',
      },
    });
  } catch (error) {
    handleError('unarchiving the program', error, res, 400);
  }
}

// DELETE /programs (soft delete/archive)
async function deleteProgram(req, res) {
  const { program_id } = req.body;
  const email = req.user?.email || req.body.email;
  
  try {
    console.log('[Programs] Deleting program:', { program_id, email });
    
    // Basic validation
    if (!program_id) {
      return res.status(400).json({
        success: false,
        error: 'Program ID is required.',
      });
    }
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'User authentication required.',
      });
    }

    const result = await programsModel.deleteProgram(parseInt(program_id), email.trim());

    // Enhanced broadcast with retry
    await broadcastUpdate(CHANNELS.PROGRAMS, 'DELETE', { program_id: parseInt(program_id) }, email);

    console.log('[Programs] Program deleted successfully:', program_id);

    res.status(200).json({
      success: true,
      message: 'Program deleted (archived) successfully.',
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'DELETE',
      },
    });
  } catch (error) {
    handleError('deleting the program', error, res, 500);
  }
}

// Enhanced health check endpoint
async function getHealth(req, res) {
  try {
    // Basic health checks
    const programsCount = await programsModel.getAllPrograms().then(p => p.length).catch(() => -1);
    const collegesCount = await programsModel.getAllColleges().then(c => c.length).catch(() => -1);
    
    res.json({
      success: true,
      status: 'healthy',
      data: {
        programs: programsCount,
        colleges: collegesCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Enhanced batch operations (for future use)
async function batchUpdatePrograms(req, res) {
  const { operations } = req.body;
  const email = req.user?.email || req.body.email;
  
  try {
    console.log('[Programs] Batch update request:', { operationsCount: operations?.length, email });
    
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Operations array is required and must not be empty.',
      });
    }
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'User authentication required.',
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process operations sequentially to avoid race conditions
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      
      try {
        let result;
        switch (operation.type?.toUpperCase()) {
          case 'CREATE':
            result = await programsModel.createProgram(
              operation.college_id,
              operation.name,
              operation.abbreviation,
              email
            );
            await broadcastUpdate(CHANNELS.PROGRAMS, 'CREATE', result, email);
            break;
            
          case 'UPDATE':
            result = await programsModel.updateProgram(
              operation.program_id,
              operation.college_id,
              operation.name,
              operation.abbreviation,
              email
            );
            await broadcastUpdate(CHANNELS.PROGRAMS, 'UPDATE', result, email);
            break;
            
          case 'ARCHIVE':
            result = await programsModel.archiveProgram(
              operation.program_id,
              email,
              operation.reason || ''
            );
            await broadcastUpdate(CHANNELS.PROGRAMS, 'ARCHIVE', result, email);
            break;
            
          case 'UNARCHIVE':
            result = await programsModel.unarchiveProgram(operation.program_id, email);
            await broadcastUpdate(CHANNELS.PROGRAMS, 'UNARCHIVE', result, email);
            break;
            
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        
        results.push({
          index: i,
          success: true,
          data: result,
          operation: operation.type,
        });
        
      } catch (operationError) {
        console.error(`[Programs] Batch operation ${i} failed:`, operationError);
        errors.push({
          index: i,
          success: false,
          error: operationError.message,
          operation: operation.type,
        });
      }
    }
    
    // Broadcast a final update to refresh all data
    if (results.length > 0) {
      setTimeout(() => {
        broadcastUpdate(CHANNELS.PROGRAMS, 'BATCH_COMPLETE', { 
          successCount: results.length,
          errorCount: errors.length 
        }, email);
      }, 100);
    }
    
    console.log(`[Programs] Batch operation completed: ${results.length} success, ${errors.length} errors`);
    
    res.status(200).json({
      success: errors.length === 0,
      message: `Batch operation completed: ${results.length} successful, ${errors.length} failed.`,
      data: {
        results,
        errors,
        summary: {
          total: operations.length,
          successful: results.length,
          failed: errors.length,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        operation: 'BATCH_UPDATE',
      },
    });
    
  } catch (error) {
    handleError('batch updating programs', error, res, 500);
  }
}

// Enhanced program statistics endpoint
async function getProgramStats(req, res) {
  try {
    console.log('[Programs] Fetching program statistics');
    
    const programs = await programsModel.getAllPrograms();
    const colleges = await programsModel.getAllColleges();
    
    const stats = {
      programs: {
        total: programs.length,
        active: programs.filter(p => p.status === 'Active').length,
        archived: programs.filter(p => p.status === 'Archived').length,
      },
      colleges: {
        total: colleges.length,
        active: colleges.filter(c => c.status === 'Active').length,
        archived: colleges.filter(c => c.status === 'Archived').length,
      },
      programsByCollege: {},
    };
    
    // Calculate programs per college
    programs.forEach(program => {
      const collegeId = program.college_id;
      if (!stats.programsByCollege[collegeId]) {
        const college = colleges.find(c => c.college_id === collegeId);
        stats.programsByCollege[collegeId] = {
          college_name: college?.name || college?.college_name || 'Unknown',
          college_abbreviation: college?.abbreviation || 'N/A',
          total: 0,
          active: 0,
          archived: 0,
        };
      }
      
      stats.programsByCollege[collegeId].total++;
      if (program.status === 'Active') {
        stats.programsByCollege[collegeId].active++;
      } else {
        stats.programsByCollege[collegeId].archived++;
      }
    });
    
    res.json({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        generated_at: new Date().toISOString(),
      },
    });
    
    console.log('[Programs] Statistics generated successfully');
  } catch (error) {
    handleError('fetching program statistics', error, res);
  }
}

// Enhanced search endpoint with filtering
async function searchPrograms(req, res) {
  const { 
    q, // search query
    college_id, 
    status, 
    limit = 50, 
    offset = 0,
    sort_by = 'name',
    sort_order = 'asc'
  } = req.query;
  
  try {
    console.log('[Programs] Searching programs:', { q, college_id, status, limit, offset });
    
    let programs = await programsModel.getAllPrograms();
    
    // Apply filters
    if (q) {
      const searchTerm = q.toLowerCase();
      programs = programs.filter(program => 
        program.program_name?.toLowerCase().includes(searchTerm) ||
        program.abbreviation?.toLowerCase().includes(searchTerm) ||
        program.college_name?.toLowerCase().includes(searchTerm)
      );
    }
    
    if (college_id) {
      programs = programs.filter(program => 
        program.college_id === parseInt(college_id)
      );
    }
    
    if (status) {
      programs = programs.filter(program => 
        program.status?.toLowerCase() === status.toLowerCase()
      );
    }
    
    // Sort results
    programs.sort((a, b) => {
      let aVal, bVal;
      
      switch (sort_by.toLowerCase()) {
        case 'name':
          aVal = a.program_name || '';
          bVal = b.program_name || '';
          break;
        case 'abbreviation':
          aVal = a.abbreviation || '';
          bVal = b.abbreviation || '';
          break;
        case 'college':
          aVal = a.college_name || '';
          bVal = b.college_name || '';
          break;
        case 'created_at':
          aVal = new Date(a.created_at || 0);
          bVal = new Date(b.created_at || 0);
          break;
        default:
          aVal = a.program_name || '';
          bVal = b.program_name || '';
      }
      
      if (aVal < bVal) return sort_order.toLowerCase() === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort_order.toLowerCase() === 'asc' ? 1 : -1;
      return 0;
    });
    
    // Apply pagination
    const total = programs.length;
    const paginatedPrograms = programs.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );
    
    res.json({
      success: true,
      data: paginatedPrograms,
      meta: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        returned: paginatedPrograms.length,
        has_more: (parseInt(offset) + parseInt(limit)) < total,
        search_query: q || null,
        filters: { college_id, status },
        sort: { sort_by, sort_order },
        timestamp: new Date().toISOString(),
      },
    });
    
    console.log(`[Programs] Search completed: ${paginatedPrograms.length}/${total} results`);
  } catch (error) {
    handleError('searching programs', error, res);
  }
}

// Export all functions with backward compatibility
module.exports = {
  // Core CRUD operations
  getAllPrograms,
  getAllColleges,
  createProgram,
  updateProgram,
  deleteProgram,
  archiveProgram,
  unarchiveProgram,
  
  // Enhanced features
  getHealth,
  batchUpdatePrograms,
  getProgramStats,
  searchPrograms,
  
  // Utility functions
  broadcastUpdate,
  handleError,
  validateProgramData,
  
  // Constants for external use
  CHANNELS,
};
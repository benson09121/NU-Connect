const sectionModel = require('../models/sectionModel');
const { publishToChannel, subscribeToChannel } = require('./sseController');

const CHANNELS = {
  SECTIONS: 'sections_updates',
};

// Enhanced broadcast helper matching programs pattern
const broadcastUpdate = async (channel, operation, data, email, retryCount = 0) => {
  const maxRetries = 3;
  
  try {
    await publishToChannel(channel, {
      operation,        // Use 'operation' not 'type' to match frontend expectations
      data,
      user: email,
      timestamp: new Date().toISOString(),
      version: Date.now(),
    });
    
    console.log(`[SSE] Broadcasted ${operation} to ${channel}:`, data?.section_id);
  } catch (broadcastError) {
    console.error(`[SSE] Broadcast failed for ${operation} on ${channel}:`, broadcastError);
    
    if (retryCount < maxRetries) {
      console.log(`[SSE] Retrying broadcast ${retryCount + 1}/${maxRetries}...`);
      setTimeout(() => {
        broadcastUpdate(channel, operation, data, email, retryCount + 1);
      }, 1000 * (retryCount + 1));
    }
  }
};

/**
 * Get all sections with optional filters
 * GET /api/sections
 * Query params: programId (optional), isActive (optional), sessionId (optional)
 */
const getAllSections = async (req, res) => {
  const { sessionId } = req.query;
  
  try {
    console.log('[Sections] Fetching all sections', { sessionId });
    
    const programId = req.query.programId ? parseInt(req.query.programId) : null;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : null;

    const sections = await sectionModel.getAllSections(programId, isActive);
    
    if (sessionId) {
      // Subscribe caller to real-time section updates
      console.log(`[SSE] Subscribing session ${sessionId} to ${CHANNELS.SECTIONS}`);
      await subscribeToChannel(sessionId, CHANNELS.SECTIONS);
    }
    
    res.status(200).json({
      success: true,
      data: sections,
      meta: {
        total: sections.length,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || null,
      },
    });
    
    console.log(`[Sections] Returned ${sections.length} sections to session ${sessionId || 'none'}`);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sections',
      error: error.message
    });
  }
};

/**
 * Get section by ID with assigned students
 * GET /api/sections/:id
 */
const getSectionById = async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);
    
    if (isNaN(sectionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid section ID'
      });
    }

    const result = await sectionModel.getSectionById(sectionId);
    
    if (!result.section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching section:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch section',
      error: error.message
    });
  }
};

/**
 * Create a new section
 * POST /api/sections
 * Body: { sectionName, programId }
 */
const addSection = async (req, res) => {
  try {
    const { sectionName, programId } = req.body;
    const createdByEmail = req.user?.email;

    // Validation
    if (!sectionName || !programId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sectionName, programId'
      });
    }

    if (!createdByEmail) {
      return res.status(401).json({
        success: false,
        message: 'User email not found in request'
      });
    }

    const section = await sectionModel.addSection(
      sectionName,
      parseInt(programId),
      createdByEmail
    );

    // Broadcast SSE event for real-time updates
    await broadcastUpdate(CHANNELS.SECTIONS, 'CREATE', section, createdByEmail);

    res.status(201).json({
      success: true,
      message: 'Section created successfully',
      data: section
    });
  } catch (error) {
    console.error('Error creating section:', error);
    
    // Handle specific error messages from stored procedure
    if (error.message.includes('Section name must be between')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('Program not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create section',
      error: error.message
    });
  }
};

/**
 * Update an existing section
 * PUT /api/sections/:id
 * Body: { sectionName }
 */
const updateSection = async (req, res) => {
  try {
    console.log('[DEBUG] Controller req.params:', req.params);
    console.log('[DEBUG] Controller req.body:', req.body);
    
    const sectionId = parseInt(req.params.id);
    const { sectionName, programId } = req.body;
    const updatedByEmail = req.user?.email;

    console.log('[DEBUG] Parsed values:', { sectionId, sectionName, programId, updatedByEmail });

    // Validation
    if (isNaN(sectionId)) {
      console.log('[DEBUG] Invalid section ID - isNaN check failed');
      return res.status(400).json({
        success: false,
        message: 'Invalid section ID'
      });
    }

    if (!sectionName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: sectionName'
      });
    }

    if (!programId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: programId'
      });
    }

    if (!updatedByEmail) {
      return res.status(401).json({
        success: false,
        message: 'User email not found in request'
      });
    }

    const section = await sectionModel.updateSection(
      sectionId,
      sectionName,
      programId,
      updatedByEmail
    );

    // Broadcast SSE event for real-time updates
    await broadcastUpdate(CHANNELS.SECTIONS, 'UPDATE', section, updatedByEmail);

    res.status(200).json({
      success: true,
      message: 'Section updated successfully',
      data: section
    });
  } catch (error) {
    console.error('Error updating section:', error);

    // Handle specific error messages from stored procedure
    if (error.message.includes('Section not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('Section name must be between')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update section',
      error: error.message
    });
  }
};

/**
 * Archive a section
 * DELETE /api/sections/:id
 */
const archiveSection = async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);

    // Validation
    if (isNaN(sectionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid section ID'
      });
    }

    const section = await sectionModel.archiveSection(sectionId);

    // Broadcast SSE event for real-time updates
    const email = req.user?.email || 'system';
    await broadcastUpdate(CHANNELS.SECTIONS, 'ARCHIVE', section, email);

    res.status(200).json({
      success: true,
      message: 'Section archived successfully',
      data: section
    });
  } catch (error) {
    console.error('Error archiving section:', error);

    // Handle specific error messages from stored procedure
    if (error.message.includes('Section not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('Cannot archive section with assigned students')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to archive section',
      error: error.message
    });
  }
};

/**
 * Unarchive a section
 * PATCH /api/sections/:id/unarchive
 */
const unarchiveSection = async (req, res) => {
  try {
    const sectionId = parseInt(req.params.id);

    // Validation
    if (isNaN(sectionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid section ID'
      });
    }

    const section = await sectionModel.unarchiveSection(sectionId);

    // Broadcast SSE event for real-time updates
    const email = req.user?.email || 'system';
    await broadcastUpdate(CHANNELS.SECTIONS, 'UNARCHIVE', section, email);

    res.status(200).json({
      success: true,
      message: 'Section unarchived successfully',
      data: section
    });
  } catch (error) {
    console.error('Error unarchiving section:', error);

    // Handle specific error messages from stored procedure
    if (error.message.includes('Section not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to unarchive section',
      error: error.message
    });
  }
};

module.exports = {
  getAllSections,
  getSectionById,
  addSection,
  updateSection,
  archiveSection,
  unarchiveSection
};

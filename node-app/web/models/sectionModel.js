const pool = require('../../config/db');

/**
 * Get all sections with optional filters
 * @param {number|null} programId - Filter by program ID (optional)
 * @param {boolean|null} isActive - Filter by active status (optional)
 * @returns {Promise<Array>} Array of sections with program/college info and student counts
 */
async function getAllSections(programId = null, isActive = null) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'CALL GetAllSections(?, ?)',
      [programId, isActive]
    );
    return rows[0]; // First result set contains the sections
  } finally {
    connection.release();
  }
};

/**
 * Get section by ID with assigned students
 * @param {number} sectionId - Section ID
 * @returns {Promise<{section: Object, students: Array}>} Section details and list of students
 */
const getSectionById = async (sectionId) => {
  const connection = await pool.getConnection();
  try {
    const [results] = await connection.execute(
      'CALL GetSectionById(?)',
      [sectionId]
    );
    return {
      section: results[0][0], // First result set, first row
      students: results[1] || [] // Second result set
    };
  } finally {
    connection.release();
  }
};

/**
 * Create a new section
 * @param {string} sectionName - Section name (2-100 characters)
 * @param {number} programId - Program ID
 * @param {string} createdByEmail - Email of user creating the section
 * @returns {Promise<Object>} Created section
 */
const addSection = async (sectionName, programId, createdByEmail) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'CALL AddSection(?, ?)',
      [sectionName, programId]
    );
    return rows[0][0]; // First result set, first row
  } finally {
    connection.release();
  }
};

/**
 * Update an existing section
 * @param {number} sectionId - Section ID
 * @param {string} sectionName - New section name (2-100 characters)
 * @param {string} updatedByEmail - Email of user updating the section
 * @returns {Promise<Object>} Updated section
 */
const updateSection = async (sectionId, sectionName, programId, updatedByEmail) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'CALL UpdateSection(?, ?, ?)',
      [sectionId, sectionName, programId]
    );
    return rows[0][0]; // First result set, first row
  } finally {
    connection.release();
  }
};

/**
 * Archive a section (set is_active to FALSE)
 * @param {number} sectionId - Section ID
 * @returns {Promise<Object>} Archived section
 * @throws {Error} If section has assigned students
 */
const archiveSection = async (sectionId) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'CALL ArchiveSection(?)',
      [sectionId]
    );
    return rows[0][0]; // First result set, first row
  } finally {
    connection.release();
  }
};

/**
 * Unarchive a section (set is_active to TRUE)
 * @param {number} sectionId - Section ID
 * @returns {Promise<Object>} Unarchived section
 */
const unarchiveSection = async (sectionId) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'CALL UnarchiveSection(?)',
      [sectionId]
    );
    return rows[0][0]; // First result set, first row
  } finally {
    connection.release();
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

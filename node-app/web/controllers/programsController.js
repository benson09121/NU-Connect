const programsModel = require('../models/programsModel');

async function getAllPrograms(req, res) {
    try {
        const programs = await programsModel.getAllPrograms();
        res.json(programs);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching programs.",
        });
    }
}

async function getAllColleges(req, res) {
    try {
        const colleges = await programsModel.getAllColleges();
        res.json(colleges);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching colleges.",
        });
    }
}

async function createProgram(req, res) {
    const { college_id, name, abbreviation, email } = req.body;
    try {
        const program = await programsModel.createProgram(college_id, name, abbreviation, email);
        res.status(201).json(program);
    } catch (error) {
        res.status(500).json({ error: error.message || "An error occurred while creating the program." });
    }
}

async function updateProgram(req, res) {
    const { program_id, college_id, name, abbreviation, email } = req.body;
    try {
        const program = await programsModel.updateProgram(program_id, college_id, name, abbreviation, email);
        res.status(200).json(program);
    } catch (error) {
        res.status(500).json({ error: error.message || "An error occurred while updating the program." });
    }
}

async function deleteProgram(req, res) {
    const { program_id, email } = req.body;
    try {
        const result = await programsModel.deleteProgram(program_id, email);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || "An error occurred while deleting the program." });
    }
}

module.exports = {
    getAllPrograms,
    getAllColleges,
    createProgram,
    updateProgram,
    deleteProgram,
};
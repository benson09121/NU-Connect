const msal = require('@azure/msal-node');
const axios = require('axios');
const accountModel = require('../models/accountModel');
const { subscribeToChannel, publishToChannel } = require('./sseController');
const { subscribe } = require('../routes/requirements');

async function getAccounts(req, res){
    const { sessionId } = req.query;
    try{
        const accounts = await accountModel.getAccounts();
        if(sessionId){
            subscribeToChannel(sessionId, "accounts");
        }
        res.status(200).json({
            data:accounts});
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the accounts.",
        });
    }
    
}

async function addAccount(req, res){
    const { email, role, program } = req.body;
    try{
        const [accounts] = await accountModel.addAccount(email, role, program);
        res.status(200).json({
            success: true,
            message: "Account added successfully.",
            data: accounts
        });
        publishToChannel('accounts', {
            operation: 'CREATE',
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching the accounts.",
        });
    }
}

async function updateAccount(req, res){
    const { user_id, email, role, program, status } = req.body;
    try{
        const accounts = await accountModel.updateAccount(user_id, email, role, program, status);
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        res.status(200).json({
            success: true,
            message: "Account updated successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while updating the account.",
        });
    }
}

async function deleteAccount(req, res){
    const { email } = req.params;
    try{
        const accounts = await accountModel.deleteAccount(email);
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        res.status(200).json({
            success: true,
            message: "Account archived successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the accounts.",
        });
    }
}

async function unarchiveAccount(req, res){
    const { user_id } = req.params;
    try{
        const accounts = await accountModel.unarchiveAccount(user_id);
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        res.status(200).json({
            success: true,
            message: "Account unarchived successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the accounts.",
        });
    }
}
async function getPrograms(req, res) {
    try {
        const programs = await accountModel.getPrograms();
        res.status(200).json({data: programs});
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching the programs.",
        });
    }
}

async function getRoles(req, res) {
    try {
        const roles = await accountModel.getRoles();
        res.status(200).json({data: roles});
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching the roles.",
        });
    }
}

async function getAllPendingUsersAndApplications(req, res) {
    try {
        const result = await accountModel.getAllPendingUsersAndApplications();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching pending users and applications.",
        });
    }
}

async function addUserApplication(req, res) {
    const { email, role, program_id, reason } = req.body;
    try {
        if (!email || !role || !program_id || !reason) {
            return res.status(400).json({ success: false, error: "All fields are required." });
        }
        const application = await accountModel.addUserApplication(email, role, program_id, reason);
        res.status(201).json({ success: true, data: application });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while submitting the application.",
        });
    }
}

module.exports = {
    getAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    unarchiveAccount,
    getPrograms,
    getRoles,
    addUserApplication,
    getAllPendingUsersAndApplications,
};
const msal = require('@azure/msal-node');
const axios = require('axios');
const userModel = require('../models/userModel');


async function getPermissions(req, res){
    const getPermission = await userModel.getPermissions(req.user.email);

        const permissions = getPermission[0]?.user_info?.permissions || [];
        permissions.includes("WEB_ACCESS") ? res.status(200).json(getPermission[0].user_info) : res.status(401).json({ message: "Access Denied" });
}

module.exports = {
    getPermissions,
};
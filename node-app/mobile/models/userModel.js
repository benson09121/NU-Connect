const pool = require('../../config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function getUser(mail) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEmail(?);', [mail]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function getPermissions(mail) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserPermissions(?)', [mail]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function generateToken(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserPermissions(?)', [email]);
        if (!rows || rows.length === 0) { // Ensure rows is not undefined or empty
            throw new Error('User not found');
        }
        const result = rows[0]; 
        console.log(result);
        const token = jwt.sign({ result }, process.env.JWT_SECRET, { expiresIn: '7d' });
        console.log(token);
        return token;
    } finally {
        connection.release();
    }
}


module.exports = { getUser, generateToken, getPermissions };

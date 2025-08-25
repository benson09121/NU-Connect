const pool = require('../../config/db');

async function getPermissions(email){
            const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserPermissions(?)', [email]);

        return rows[0];
    }   
    catch (error) {
        console.error('Error fetching permissions:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function createUser(user){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CreateUser(?, ?, ?, ?)', [user.user_id, user.f_name, user.l_name, user.email]);
        return rows[0];
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    } finally {
        connection.release();
    }
}


async function checkUserExists(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEmail(?)', [email]);
        return rows[0];
    } catch (error) {
        console.error('Error checking user existence:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function handleLogin(user) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL HandleLogin(?, ?, ?)', [user.email, user.f_name, user.l_name]);
        return rows[0];
    } catch (error) {
        console.error('Error handling login:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getPermissions,
    createUser,
    checkUserExists,
    handleLogin
};
const { redisClient } = require('../../config/redis');

class UserCacheModel {
    // Cache users by organization
    async cacheUsersByOrganization(org_name, users) {
        const key = `org:${org_name}:users`;
        const pipeline = redisClient.pipeline();
        
        // Clear existing data
        await redisClient.del(key);
        
        // Store each user as a hash field
        users.forEach(user => {
            pipeline.hset(key, user.email, JSON.stringify({
                email: user.email,
                f_name: user.f_name,
                l_name: user.l_name,
                user_id: user.user_id,
                program_name: user.program_name,
                role: user.role,
                org_name: org_name,
            }));
        });
        
        await pipeline.exec();
        // Set expiration (1 hour)
        await redisClient.expire(key, 3600);
    }

    // Search users by email pattern within organization
    async searchUsersByEmail(org_name, emailPattern) {
        const key = `org:${org_name}:users`;
        const allUsers = await redisClient.hgetall(key);
        
        const matches = [];
        const pattern = emailPattern.toLowerCase();
        
        for (const [email, userData] of Object.entries(allUsers)) {
            if (email.toLowerCase().includes(pattern)) {
                matches.push({
                    email,
                    ...JSON.parse(userData)
                });
            }
        }
        
        // Sort by relevance (exact match first, then starts with, then contains)
        return matches.sort((a, b) => {
            const aEmail = a.email.toLowerCase();
            const bEmail = b.email.toLowerCase();
            
            if (aEmail === pattern) return -1;
            if (bEmail === pattern) return 1;
            if (aEmail.startsWith(pattern)) return -1;
            if (bEmail.startsWith(pattern)) return 1;
            return 0;
        }).slice(0, 10); // Limit to 10 results
    }

    // Get all users for an organization
    async getUsersByOrganization(org_name) {
        const key = `org:${org_name}:users`;
        const cached = await redisClient.hgetall(key);
        
        if (Object.keys(cached).length === 0) {
            return null; // Cache miss
        }
        
        return Object.values(cached).map(userData => JSON.parse(userData));
    }
    async cacheUsersByProgram(program_name, users) {
        const key = `program:${program_name}:users`;
        const pipeline = redisClient.pipeline();

        // Clear existing data
        await redisClient.del(key);

        // Store each user as a hash field
        users.forEach(user => {
            pipeline.hset(key, user.email, JSON.stringify({
                email: user.email,
                f_name: user.f_name,
                l_name: user.l_name,
                user_id: user.user_id,
                program_name: user.program_name,
                role: user.role,
                org_name: user.org_name,
            }));
        });

        await pipeline.exec();
        // Set expiration (1 hour)
        await redisClient.expire(key, 3600);
    }

     async cacheAllUsers(users) {
        const key = `all:users`;
        const pipeline = redisClient.pipeline();

        // Clear existing data
        await redisClient.del(key);

        // Store each user as a hash field
        users.forEach(user => {
            pipeline.hset(key, user.email, JSON.stringify({
                email: user.email,
                f_name: user.f_name,
                l_name: user.l_name,
                user_id: user.user_id,
                program_name: user.program_name,
                role: user.role,
                org_name: user.org_name,
            }));
        });

        await pipeline.exec();
        // Set expiration (1 hour)
        await redisClient.expire(key, 3600);
    }
    
async searchAllUsersByEmail(emailPattern) {
    const key = `all:users`;
    const allUsers = await redisClient.hgetall(key);

    const matches = [];
    const pattern = emailPattern.toLowerCase();

    for (const [email, userData] of Object.entries(allUsers)) {
        const user = JSON.parse(userData);
        if (
            email.toLowerCase().includes(pattern) ||
            (user.f_name && user.f_name.toLowerCase().includes(pattern)) ||
            (user.l_name && user.l_name.toLowerCase().includes(pattern))
        ) {
            matches.push({
                email: user.email,
                f_name: user.f_name,
                l_name: user.l_name,
                user_id: user.user_id,
                program_name: user.program_name,
                role: user.role,
                org_name: user.org_name
            });
        }
    }

    // Sort by relevance and limit results
   return matches.sort((a, b) => {
    const patternLower = pattern;

    // Helper to get best match score for a user
    function getScore(user) {
        const fields = [user.email, user.f_name, user.l_name].map(f => f?.toLowerCase() || '');
        if (fields.some(f => f === patternLower)) return 0; // exact match
        if (fields.some(f => f.startsWith(patternLower))) return 1; // starts with
        if (fields.some(f => f.includes(patternLower))) return 2; // contains
        return 3; // no match (shouldn't happen)
    }

    return getScore(a) - getScore(b);
}).slice(0, 10);
}

}

module.exports = new UserCacheModel();
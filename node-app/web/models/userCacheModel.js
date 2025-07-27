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
                is_executive: user.is_executive,
                is_committee: user.is_committee
            }));
        });
        
        await pipeline.exec();
        // Set expiration (1 hour)
        await redisClient.expire(key, 3600);
    }

    async cacheSingleOrganizationUser(orgn_name, user) {
        const key = `org:${orgn_name}:users`;
        const exists = await redisClient.exists(key);
        if (!exists) return; // Only update if cache exists

        await redisClient.hset(key, user.email, JSON.stringify({
            email: user.email,
            f_name: user.f_name,
            l_name: user.l_name,
            user_id: user.user_id,
            program_name: user.program_name,
            role: user.role,
            org_name: user.org_name,
            is_executive: user.is_executive,
            is_committee: user.is_committee
        }));
        await redisClient.expire(key, 3600);
    }

    

async searchUsersByEmail(org_name, emailPattern) {
    const key = `org:${org_name}:users`;
    const allUsers = await redisClient.hgetall(key);

    const matches = [];
    const pattern = emailPattern.toLowerCase();

    for (const [email, userData] of Object.entries(allUsers)) {
        const user = JSON.parse(userData);
        if (
            email.toLowerCase().includes(pattern) ||
            (user.f_name && user.f_name.toLowerCase().includes(pattern)) ||
            (user.l_name && user.l_name.toLowerCase().includes(pattern)) ||
            (user.program_name && user.program_name.toLowerCase().includes(pattern))
        ) {
            matches.push({
                email,
                ...user
            });
        }
    }

    // Sort by relevance (exact match first, then starts with, then contains)
    return matches.sort((a, b) => {
        const fieldsA = [a.email, a.f_name, a.l_name, a.program_name].map(f => f?.toLowerCase() || '');
        const fieldsB = [b.email, b.f_name, b.l_name, b.program_name].map(f => f?.toLowerCase() || '');

        function getScore(fields) {
            if (fields.some(f => f === pattern)) return 0;
            if (fields.some(f => f.startsWith(pattern))) return 1;
            if (fields.some(f => f.includes(pattern))) return 2;
            return 3;
        }

        return getScore(fieldsA) - getScore(fieldsB);
    }).slice(0, 10); // Limit to 10 results
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

        async cacheSingleUser(user) {
        const key = `all:users`;
        const exists = await redisClient.exists(key);
        if (!exists){
            console.log("Cache does not exist, skipping update");
            return;
        }
        await redisClient.hset(key, user.email, JSON.stringify({
            email: user.email,
            f_name: user.f_name,
            l_name: user.l_name,
            user_id: user.user_id,
            program_name: user.program_name,
            role: user.role,
            org_name: user.org_name,
        }));
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
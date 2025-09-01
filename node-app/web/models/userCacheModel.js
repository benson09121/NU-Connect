const { redisClient } = require('../../config/redis');

function orgKey(org_id, org_version_id) {
  return `org:${org_id}:v:${org_version_id}:users`;
}

class UserCacheModel {
  // Cache users by organization + version
  async cacheUsersByOrganization(org_id, org_version_id, users) {
    const key = orgKey(org_id, org_version_id);
    const pipeline = redisClient.pipeline();

    // Clear existing data
    await redisClient.del(key);

    // Store each user as hash field keyed by email
    users.forEach((user) => {
      pipeline.hset(
        key,
        user.email,
        JSON.stringify({
          email: user.email,
          f_name: user.f_name,
          l_name: user.l_name,
          user_id: user.user_id,
          program_name: user.program_name,
          role: user.role,
          org_id,
          org_version_id,
          is_executive: !!user.is_executive,
          is_committee: !!user.is_committee,
        })
      );
    });

    await pipeline.exec();
    await redisClient.expire(key, 3600); // 1 hour TTL
  }

  // Update single user inside an existing org/version cache
  async cacheSingleOrganizationUser(org_id, org_version_id, user) {
    const key = orgKey(org_id, org_version_id);
    const exists = await redisClient.exists(key);
    if (!exists) return; // only update if cache exists

    await redisClient.hset(
      key,
      user.email,
      JSON.stringify({
        email: user.email,
        f_name: user.f_name,
        l_name: user.l_name,
        user_id: user.user_id,
        program_name: user.program_name,
        role: user.role,
        org_id,
        org_version_id,
        is_executive: !!user.is_executive,
        is_committee: !!user.is_committee,
      })
    );
    await redisClient.expire(key, 3600);
  }

  // Search by email/name/program within specific org/version
  async searchUsersByEmail(org_id, org_version_id, emailPattern) {
    const key = orgKey(org_id, org_version_id);
    const allUsers = await redisClient.hgetall(key);
    if (!allUsers || Object.keys(allUsers).length === 0) return [];

    const matches = [];
    const pattern = emailPattern.toLowerCase();

    for (const [email, userData] of Object.entries(allUsers)) {
      const user = JSON.parse(userData);
      const fName = user.f_name?.toLowerCase() || '';
      const lName = user.l_name?.toLowerCase() || '';
      const prog = user.program_name?.toLowerCase() || '';

      if (
        email.toLowerCase().includes(pattern) ||
        fName.includes(pattern) ||
        lName.includes(pattern) ||
        prog.includes(pattern)
      ) {
        matches.push({
          email,
          ...user,
        });
      }
    }

    // Relevance sort
    const score = (u) => {
      const fields = [u.email, u.f_name, u.l_name, u.program_name]
        .map((f) => f?.toLowerCase() || '');
      if (fields.some((f) => f === pattern)) return 0;
      if (fields.some((f) => f.startsWith(pattern))) return 1;
      if (fields.some((f) => f.includes(pattern))) return 2;
      return 3;
    };

    return matches.sort((a, b) => score(a) - score(b)).slice(0, 10);
  }

  // Global cache for all users
  async cacheAllUsers(users) {
    const key = `all:users`;
    const pipeline = redisClient.pipeline();

    await redisClient.del(key);

    users.forEach((user) => {
      pipeline.hset(
        key,
        user.email,
        JSON.stringify({
          email: user.email,
          f_name: user.f_name,
          l_name: user.l_name,
          user_id: user.user_id,
          program_name: user.program_name,
          role: user.role,
          org_name: user.org_name || null,
        })
      );
    });

    await pipeline.exec();
    await redisClient.expire(key, 3600);
  }

  async cacheSingleUser(user) {
    const key = `all:users`;
    const exists = await redisClient.exists(key);
    if (!exists) {
      console.log('Cache does not exist, skipping update');
      return;
    }
    await redisClient.hset(
      key,
      user.email,
      JSON.stringify({
        email: user.email,
        f_name: user.f_name,
        l_name: user.l_name,
        user_id: user.user_id,
        program_name: user.program_name,
        role: user.role,
        org_name: user.org_name || null,
      })
    );
    await redisClient.expire(key, 3600);
  }

  async searchAllUsersByEmail(emailPattern) {
    const key = `all:users`;
    const allUsers = await redisClient.hgetall(key);
    if (!allUsers || Object.keys(allUsers).length === 0) return [];

    const matches = [];
    const pattern = emailPattern.toLowerCase();

    for (const [, userData] of Object.entries(allUsers)) {
      const user = JSON.parse(userData);
      const fName = user.f_name?.toLowerCase() || '';
      const lName = user.l_name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';

      if (email.includes(pattern) || fName.includes(pattern) || lName.includes(pattern)) {
        matches.push({
          email: user.email,
          f_name: user.f_name,
          l_name: user.l_name,
          user_id: user.user_id,
          program_name: user.program_name,
          role: user.role,
          org_name: user.org_name || null,
        });
      }
    }

    const score = (u) => {
      const fields = [u.email, u.f_name, u.l_name].map((f) => f?.toLowerCase() || '');
      if (fields.some((f) => f === pattern)) return 0;
      if (fields.some((f) => f.startsWith(pattern))) return 1;
      if (fields.some((f) => f.includes(pattern))) return 2;
      return 3;
    };

    return matches.sort((a, b) => score(a) - score(b)).slice(0, 10);
  }
}

module.exports = new UserCacheModel();
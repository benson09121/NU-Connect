import { redisClient } from '../../config/redis';

function orgKey(orgId: string | number, orgVersionId: string | number): string {
  return `org:${orgId}:v:${orgVersionId}:users`;
}

interface CachedUser {
  email: string;
  f_name?: string | null;
  l_name?: string | null;
  user_id?: string | null;
  program_name?: string | null;
  role?: string | null;
  org_name?: string | null;
  is_executive?: boolean;
  is_committee?: boolean;
}

class UserCacheModel {
  async cacheUsersByOrganization(orgId: string | number, orgVersionId: string | number, users: CachedUser[]): Promise<void> {
    const key = orgKey(orgId, orgVersionId);
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
          org_id: orgId,
          org_version_id: orgVersionId,
          is_executive: !!user.is_executive,
          is_committee: !!user.is_committee,
        }),
      );
    });

    await pipeline.exec();
    await redisClient.expire(key, 3600);
  }

  async cacheSingleOrganizationUser(orgId: string | number, orgVersionId: string | number, user: CachedUser): Promise<void> {
    const key = orgKey(orgId, orgVersionId);
    const exists = await redisClient.exists(key);
    if (!exists) return;

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
        org_id: orgId,
        org_version_id: orgVersionId,
        is_executive: !!user.is_executive,
        is_committee: !!user.is_committee,
      }),
    );
    await redisClient.expire(key, 3600);
  }

  async searchUsersByEmail(orgId: string | number, orgVersionId: string | number, emailPattern: string): Promise<any[]> {
    const key = orgKey(orgId, orgVersionId);
    const allUsers = await redisClient.hgetall(key);
    if (!allUsers || Object.keys(allUsers).length === 0) return [];

    const matches: any[] = [];
    const pattern = emailPattern.toLowerCase();

    for (const [email, userData] of Object.entries(allUsers)) {
      const user = JSON.parse(userData as string);
      const fName = user.f_name?.toLowerCase() || '';
      const lName = user.l_name?.toLowerCase() || '';
      const prog = user.program_name?.toLowerCase() || '';

      if (
        email.toLowerCase().includes(pattern) ||
        fName.includes(pattern) ||
        lName.includes(pattern) ||
        prog.includes(pattern)
      ) {
        matches.push({ email, ...user });
      }
    }

    const score = (u: any): number => {
      const fields = [u.email, u.f_name, u.l_name, u.program_name].map((f) => f?.toLowerCase() || '');
      if (fields.some((f) => f === pattern)) return 0;
      if (fields.some((f) => f.startsWith(pattern))) return 1;
      if (fields.some((f) => f.includes(pattern))) return 2;
      return 3;
    };

    return matches.sort((a, b) => score(a) - score(b)).slice(0, 10);
  }

  async cacheAllUsers(users: CachedUser[]): Promise<void> {
    const key = 'all:users';
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
        }),
      );
    });

    await pipeline.exec();
    await redisClient.expire(key, 3600);
  }

  async cacheSingleUser(user: CachedUser): Promise<void> {
    const key = 'all:users';
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
      }),
    );
    await redisClient.expire(key, 3600);
  }

  async searchAllUsersByEmail(emailPattern: string): Promise<any[]> {
    const key = 'all:users';
    const allUsers = await redisClient.hgetall(key);
    if (!allUsers || Object.keys(allUsers).length === 0) return [];

    const matches: any[] = [];
    const pattern = emailPattern.toLowerCase();

    for (const [, userData] of Object.entries(allUsers)) {
      const user = JSON.parse(userData as string);
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

    const score = (u: any): number => {
      const fields = [u.email, u.f_name, u.l_name].map((f) => f?.toLowerCase() || '');
      if (fields.some((f) => f === pattern)) return 0;
      if (fields.some((f) => f.startsWith(pattern))) return 1;
      if (fields.some((f) => f.includes(pattern))) return 2;
      return 3;
    };

    return matches.sort((a, b) => score(a) - score(b)).slice(0, 10);
  }
}

export = new UserCacheModel();

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import axios from 'axios';
import 'dotenv/config';
import { can, canAny } from '../services/permissionService';
import { prisma } from '../config/db';

interface JwtUserInfo {
  user_id?: string;
  email: string;
  f_name?: string;
  l_name?: string;
  role?: string;
  program_id?: string | number;
  program_name?: string;
  permissions?: string[];
  organizations?: any[];
  pending_application?: any;
}

interface DecodedToken extends jwt.JwtPayload {
  result?: Array<{ user_info: JwtUserInfo }>;
}

interface AzureJwtPayload extends jwt.JwtPayload {
  preferred_username?: string;
  email?: string;
  upn?: string;
  unique_name?: string;
  tid?: string;
  name?: string;
  sub?: string;
}

interface ResolvedDbUser {
  user_id: string;
  email: string;
  f_name: string | null;
  l_name: string | null;
  status: string;
  role_name: string | null;
}

type AuthChannel = 'web' | 'mobile';

class AuthValidationError extends Error {
  code: string;
  status: number;
  authDebug?: Record<string, unknown>;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function parseBoolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeRawToken(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;

    let token = raw.trim();
    if (!token) return null;

    // Remove only surrounding quotes
    token = token.replace(/^['"]|['"]$/g, '');
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }

    return token || null;
}

function extractBearerTokenStrict(req: Request, allowBodyFallback: boolean): string {
  const authHeader = req.headers.authorization;

  if (typeof authHeader === 'string' && authHeader.trim()) {
    const token = normalizeRawToken(authHeader);
    if (!token) {
      throw new AuthValidationError('MALFORMED_JWT', 'Authorization token is empty after normalization');
    }

    const dotCount = (token.match(/\./g) || []).length;
    if (dotCount !== 2) {
      throw new AuthValidationError('MALFORMED_JWT', 'JWT must contain exactly 3 segments');
    }

    return token;
  }

  if (!allowBodyFallback) {
    throw new AuthValidationError('UNAUTHORIZED', 'Token missing');
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const candidates = [
    body.access_token,
    body.accessToken,
    body.id_token,
    body.idToken,
    body.token,
    body.authorization,
    body.Authorization,
    body.bearerToken,
    body.jwt,
  ];

  for (const candidate of candidates) {
    const token = normalizeRawToken(candidate);
    if (!token) continue;

    const dotCount = (token.match(/\./g) || []).length;
    if (dotCount !== 2) {
      throw new AuthValidationError('MALFORMED_JWT', 'JWT must contain exactly 3 segments');
    }

    return token;
  }

  throw new AuthValidationError('UNAUTHORIZED', 'Token missing');
}

function decodeTokenMetadata(token: string): { header: jwt.JwtHeader; payload: AzureJwtPayload } {
  const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;

  if (!decoded || !decoded.header || !decoded.payload) {
    throw new AuthValidationError('MALFORMED_JWT', 'Invalid token structure');
  }

  const header = decoded.header as jwt.JwtHeader;
  const payload = decoded.payload as AzureJwtPayload;

  if (!header.kid) {
    throw new AuthValidationError('MALFORMED_JWT', 'Token header is missing kid');
  }

  if (header.alg !== 'RS256') {
    throw new AuthValidationError('MALFORMED_JWT', `Unsupported JWT alg: ${String(header.alg || 'unknown')}`);
  }

  return { header, payload };
}

function resolveAzureAuthority(payload: AzureJwtPayload): { tid: string; ver: string; issuer: string; jwksUri: string } {
  const envTid = process.env.AZURE_TENANT_ID?.trim();
  const tokenTid = payload.tid?.trim();
  const tid = tokenTid || envTid;

  if (!tid) {
    throw new AuthValidationError('INVALID_TENANT', 'Token missing tid and AZURE_TENANT_ID is not configured');
  }

  if (envTid && tokenTid && envTid !== tokenTid) {
    throw new AuthValidationError('INVALID_TENANT', 'Token tenant does not match configured tenant');
  }

  const ver = String(payload.ver || '1.0');
  if (ver === '2.0') {
    return {
      tid,
      ver,
      issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
      jwksUri: `https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`,
    };
  }

  return {
    tid,
    ver,
    issuer: `https://sts.windows.net/${tid}/`,
    jwksUri: `https://login.microsoftonline.com/${tid}/discovery/keys`,
  };
}

function getAllowedAudiences(channel: AuthChannel): string[] {
  const fromEnv = channel === 'web'
    ? parseCsvEnv(process.env.AZURE_ALLOWED_AUDIENCES_WEB)
    : parseCsvEnv(process.env.AZURE_ALLOWED_AUDIENCES_MOBILE);

  if (fromEnv.length > 0) return fromEnv;

  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AuthValidationError('SERVER_CONFIG_ERROR', 'AZURE_CLIENT_ID is not configured', 500);
  }

  // Default fallback for backward compatibility with current mobile flow.
  if (channel === 'mobile') {
    return [clientId, '00000003-0000-0000-c000-000000000000'];
  }

  return [clientId];
}

function debugAuth(channel: AuthChannel, token: string, payload: AzureJwtPayload, header: jwt.JwtHeader, authority: { issuer: string; jwksUri: string }): void {
  if (process.env.NODE_ENV !== 'development') return;

  const dotCount = (token.match(/\./g) || []).length;
  console.log(`[auth:${channel}] tokenLen=${token.length} dotCount=${dotCount} kid=${String(header.kid || '')} tid=${String(payload.tid || '')} ver=${String(payload.ver || '1.0')} iss=${String(payload.iss || '')} aud=${JSON.stringify(payload.aud || '')}`);
  console.log(`[auth:${channel}] selected issuer=${authority.issuer} jwks=${authority.jwksUri}`);
}

function mapVerificationError(err: any): AuthValidationError {
  if (err instanceof AuthValidationError) return err;

  const name = String(err?.name || '');
  const msg = String(err?.message || 'Token verification failed');

  if (name === 'TokenExpiredError') return new AuthValidationError('TOKEN_EXPIRED', msg);
  if (name === 'NotBeforeError') return new AuthValidationError('TOKEN_NOT_ACTIVE', msg);
  if (name === 'JsonWebTokenError' && /audience/i.test(msg)) return new AuthValidationError('INVALID_AUDIENCE', msg);
  if (name === 'JsonWebTokenError' && /issuer/i.test(msg)) return new AuthValidationError('INVALID_ISSUER', msg);
  if (name === 'JsonWebTokenError' && /invalid signature/i.test(msg)) return new AuthValidationError('INVALID_SIGNATURE', msg);
  if (/tenant/i.test(msg)) return new AuthValidationError('INVALID_TENANT', msg);

  return new AuthValidationError('UNAUTHORIZED', msg);
}

async function verifyWithJwksUri(
  token: string,
  kid: string,
  jwksUri: string,
  issuer: string,
  audience: string | [string, ...string[]],
): Promise<AzureJwtPayload> {
  const client = jwksClient({
    jwksUri,
    cache: true,
    cacheMaxAge: 10 * 60 * 1000,
  });

  const key = await client.getSigningKey(kid);
  const publicKey = key.getPublicKey();

  return jwt.verify(token, publicKey, {
    audience,
    issuer,
    algorithms: ['RS256'],
  }) as AzureJwtPayload;
}

async function verifyAzureTokenCore(token: string, channel: AuthChannel): Promise<AzureJwtPayload> {
  const { header, payload } = decodeTokenMetadata(token);
  const authority = resolveAzureAuthority(payload);
  const acceptedAudiences = getAllowedAudiences(channel);

  debugAuth(channel, token, payload, header, authority);

  try {
    const audienceOption = acceptedAudiences.length === 1
      ? acceptedAudiences[0]
      : (acceptedAudiences as [string, ...string[]]);

    const verified = await verifyWithJwksUri(
      token,
      String(header.kid),
      authority.jwksUri,
      authority.issuer,
      audienceOption,
    );

    if (verified.tid && verified.tid !== authority.tid) {
      throw new AuthValidationError('INVALID_TENANT', 'Token tenant does not match selected authority');
    }

    return verified;
  } catch (err: any) {
    const allowCommonFallback =
      channel === 'mobile' &&
      parseBoolEnv(process.env.AZURE_MOBILE_ALLOW_COMMON_JWKS_FALLBACK, true);

    const baseMapped = mapVerificationError(err);

    if (allowCommonFallback && baseMapped.code === 'INVALID_SIGNATURE') {
      const audienceOption = acceptedAudiences.length === 1
        ? acceptedAudiences[0]
        : (acceptedAudiences as [string, ...string[]]);
      const commonJwksUri = authority.ver === '2.0'
        ? 'https://login.microsoftonline.com/common/discovery/v2.0/keys'
        : 'https://login.microsoftonline.com/common/discovery/keys';

      try {
        const fallbackVerified = await verifyWithJwksUri(
          token,
          String(header.kid),
          commonJwksUri,
          authority.issuer,
          audienceOption,
        );

        if (fallbackVerified.tid && fallbackVerified.tid !== authority.tid) {
          throw new AuthValidationError('INVALID_TENANT', 'Token tenant does not match selected authority');
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(`[auth:${channel}] primary JWKS invalid signature; verified via common JWKS fallback`);
        }

        return fallbackVerified;
      } catch (fallbackErr: any) {
        const mappedFallback = mapVerificationError(fallbackErr);
        mappedFallback.authDebug = {
          channel,
          tokenLen: token.length,
          dotCount: (token.match(/\./g) || []).length,
          kid: String(header.kid || ''),
          alg: String(header.alg || ''),
          tid: String(payload.tid || ''),
          ver: String(payload.ver || '1.0'),
          iss: String(payload.iss || ''),
          aud: payload.aud || null,
          selectedIssuer: authority.issuer,
          selectedJwks: authority.jwksUri,
          commonFallbackJwks: commonJwksUri,
          primaryErrorName: String(err?.name || ''),
          primaryErrorMessage: String(err?.message || ''),
          fallbackErrorName: String(fallbackErr?.name || ''),
          fallbackErrorMessage: String(fallbackErr?.message || ''),
        };
        throw mappedFallback;
      }
    }

    const mapped = baseMapped;
    mapped.authDebug = {
      channel,
      tokenLen: token.length,
      dotCount: (token.match(/\./g) || []).length,
      kid: String(header.kid || ''),
      alg: String(header.alg || ''),
      tid: String(payload.tid || ''),
      ver: String(payload.ver || '1.0'),
      iss: String(payload.iss || ''),
      aud: payload.aud || null,
      selectedIssuer: authority.issuer,
      selectedJwks: authority.jwksUri,
      commonFallbackEnabled: allowCommonFallback,
      errorName: String(err?.name || ''),
      errorMessage: String(err?.message || ''),
    };
    throw mapped;
  }
}

function extractBearerToken(req: Request): string | null {
  try {
    const allowBodyFallback = parseBoolEnv(process.env.AUTH_ALLOW_BODY_TOKEN_FALLBACK, false);
    return extractBearerTokenStrict(req, allowBodyFallback);
  } catch {
    return null;
  }
}

async function verifyAzureToken(token: string): Promise<AzureJwtPayload> {
  return verifyAzureTokenCore(token, 'mobile');
}

type GraphMeResponse = {
  id?: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  displayName?: string;
};

function isGraphAudience(aud: unknown): boolean {
  if (typeof aud !== 'string') return false;
  return aud === '00000003-0000-0000-c000-000000000000' || aud === 'https://graph.microsoft.com';
}

async function verifyGraphTokenViaMe(token: string): Promise<AzureJwtPayload> {
  const resp = await axios.get<GraphMeResponse>('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,givenName,surname,displayName', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  });

  const me = resp.data || {};
  const email = me.mail || me.userPrincipalName;
  if (!email) {
    throw new AuthValidationError('UNAUTHORIZED', 'Graph token validated but no usable email claim found');
  }

  return {
    email,
    preferred_username: me.userPrincipalName || email,
    unique_name: me.userPrincipalName || email,
    name: me.displayName || [me.surname, me.givenName].filter(Boolean).join(', '),
  } as AzureJwtPayload;
}

function sendAuthError(res: Response, err: any): void {
  const mapped = mapVerificationError(err);
  res.status(mapped.status).json({
    error: mapped.message,
    code: mapped.code,
    details: process.env.NODE_ENV === 'development' ? mapped.message : undefined,
    authDebug: process.env.NODE_ENV === 'development' ? mapped.authDebug : undefined,
  });
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return value || null;
}

function collectCandidateEmails(
  primary: string,
  verified: AzureJwtPayload,
  reqBody?: Record<string, unknown>,
): string[] {
  const values: unknown[] = [
    primary,
    verified.preferred_username,
    verified.email,
    verified.upn,
    verified.unique_name,
    reqBody?.mail,
    reqBody?.email,
    reqBody?.userPrincipalName,
    reqBody?.preferred_username,
  ];

  const normalized = values
    .map(normalizeEmail)
    .filter((v): v is string => Boolean(v));

  return Array.from(new Set(normalized));
}

function extractLegacyToken(req: Request): string | null {
  const normalizeToken = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;

    let token = raw.trim();
    if (!token) return null;

    token = token.replace(/^['"]|['"]$/g, '');
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }

    // Handle accidental JSON token blobs in a single field
    if (token.startsWith('{') && token.endsWith('}')) {
      try {
        const parsed = JSON.parse(token) as Record<string, unknown>;
        const fromJson =
          (typeof parsed.access_token === 'string' && parsed.access_token) ||
          (typeof parsed.accessToken === 'string' && parsed.accessToken) ||
          (typeof parsed.id_token === 'string' && parsed.id_token) ||
          (typeof parsed.idToken === 'string' && parsed.idToken) ||
          null;

        if (fromJson) return normalizeToken(fromJson);
      } catch {
        return null;
      }
    }

    return token || null;
  };

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return normalizeToken(authHeader);
  }

  const queryToken = normalizeToken(req.query.access_token);
  if (queryToken) return queryToken;

  const body = (req.body || {}) as Record<string, unknown>;
  const bodyToken =
    normalizeToken(body.access_token) ||
    normalizeToken(body.accessToken) ||
    normalizeToken(body.id_token) ||
    normalizeToken(body.idToken) ||
    normalizeToken(body.token) ||
    normalizeToken(body.authorization) ||
    normalizeToken(body.Authorization) ||
    normalizeToken(body.bearerToken) ||
    normalizeToken(body.jwt) ||
    null;

  return bodyToken;
}

async function resolveOrProvisionUserFromEmail(
  email: string,
  verified: AzureJwtPayload,
  candidateEmails: string[] = [],
): Promise<ResolvedDbUser | null> {
  const allCandidates = Array.from(new Set([
    ...candidateEmails,
    ...(normalizeEmail(email) ? [normalizeEmail(email) as string] : []),
  ]));

  if (allCandidates.length === 0) {
    return null;
  }

  let dbUser = await prisma.tbl_user.findFirst({
    where: {
      OR: allCandidates.map((candidate) => ({
        email: { equals: candidate, mode: 'insensitive' as const },
      })),
    },
    select: {
      user_id: true,
      f_name: true,
      l_name: true,
      email: true,
      status: true,
      tbl_role: { select: { role_name: true } },
    },
  });

  if (dbUser) {
    return {
      user_id: dbUser.user_id,
      email: dbUser.email,
      f_name: dbUser.f_name,
      l_name: dbUser.l_name,
      status: dbUser.status,
      role_name: dbUser.tbl_role?.role_name ?? null,
    };
  }

  const staging = await prisma.tbl_user_application.findFirst({
    where: {
      status: 'Approved',
      OR: allCandidates.map((candidate) => ({
        email: { equals: candidate, mode: 'insensitive' as const },
      })),
    },
    include: { tbl_role: { select: { role_id: true, role_name: true } } },
  });

  if (!staging) return null;

  const canonicalEmail = normalizeEmail(staging.email) || allCandidates[0];

  const created = await prisma.tbl_user.create({
    data: {
      email: canonicalEmail,
      f_name: verified.name?.split(',')[1]?.trim() ?? '',
      l_name: verified.name?.split(',')[0]?.trim() ?? '',
      role_id: staging.role_id,
      program_id: staging.program_id ?? undefined,
      status: 'Active',
    },
    select: {
      user_id: true,
      f_name: true,
      l_name: true,
      email: true,
      status: true,
      tbl_role: { select: { role_name: true } },
    },
  });

  await prisma.tbl_user_application.update({
    where: { application_id: staging.application_id },
    data: { transferred_at: new Date() },
  });

  return {
    user_id: created.user_id,
    email: created.email,
    f_name: created.f_name,
    l_name: created.l_name,
    status: created.status,
    role_name: created.tbl_role?.role_name ?? null,
  };
}

// export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//   console.log('DEBUG AUTH: authMiddleware called for:', req.method, req.url);
//   const token = req.headers['authorization']?.split(' ')[1];
//   console.log('DEBUG AUTH: Token:', token ? `${token.substring(0, 20)}...` : 'No token');

//   if (!token) {
//     console.log('DEBUG AUTH: No token provided, returning 401');
//     res.status(401).json({ message: 'No token provided' });
//     return;
//   }

//   jwt.verify(token, process.env.JWT_SECRET as string, (err, decoded) => {
//     if (err) {
//       console.log('DEBUG AUTH: Token verification failed:', err.message);
//       res.status(401).json({ message: 'Invalid token' });
//       return;
//     }

//     const payload = decoded as DecodedToken;
//     const userInfo = payload.result?.[0]?.user_info;

//     if (!userInfo) {
//       console.log('DEBUG AUTH: Invalid token structure, decoded:', decoded);
//       res.status(401).json({ message: 'Invalid token structure' });
//       return;
//     }

//     console.log('DEBUG AUTH: Token verified successfully for user:', userInfo.email);

//     req.user = {
//       user_id: userInfo.user_id ?? userInfo.email,
//       email: userInfo.email,
//       first_name: userInfo.f_name,
//       last_name: userInfo.l_name,
//       role: userInfo.role,
//       program_id: userInfo.program_id,
//       program_name: userInfo.program_name,
//       permissions: userInfo.permissions,
//       organizations: userInfo.organizations,
//       pending_application: userInfo.pending_application,
//     };
//     next();
//   });
// };

export const validateAzureJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractBearerTokenStrict(req, false);
    const verified = await verifyAzureTokenCore(token, 'web');
    const email = verified.preferred_username || verified.email || verified.upn || verified.unique_name;
    if (!email) {
      res.status(401).json({ error: 'Token missing email claim' });
      return;
    }

    // ── 1. Look up user in tbl_user by email ──────────────────────────────
    let dbUser = await prisma.tbl_user.findFirst({
      where: { email },
      select: {
        user_id: true,
        f_name: true,
        l_name: true,
        email: true,
        tbl_role: { select: { role_name: true } },
      },
    });

    // ── 2. First-time login: check tbl_user_application staging ──────────
    if (!dbUser) {
      const staging = await prisma.tbl_user_application.findFirst({
        where: { email, status: 'Approved' },
        include: { tbl_role: { select: { role_id: true, role_name: true } } },
      });

      if (!staging) {
        res.status(403).json({
          error: 'ACCOUNT_NOT_APPROVED',
          message: 'Your account has not been approved yet. Please contact the SDAO.',
        });
        return;
      }

      // Block students before provisioning — mobile app only
      if (staging.tbl_role.role_name === 'Student') {
        res.status(403).json({ error: 'STUDENT_WEB_ACCESS_DENIED' });
        return;
      }

      // Auto-provision: INSERT into tbl_user (UUID generated by DB)
      dbUser = await prisma.tbl_user.create({
        data: {
          email,
          f_name: verified.name?.split(',')[1]?.trim() ?? '',
          l_name: verified.name?.split(',')[0]?.trim() ?? '',
          role_id: staging.role_id,
          program_id: staging.program_id ?? undefined,
          status: 'Active',
        },
        select: {
          user_id: true,
          f_name: true,
          l_name: true,
          email: true,
          tbl_role: { select: { role_name: true } },
        },
      });

      // Mark staging record as transferred
      await prisma.tbl_user_application.update({
        where: { application_id: staging.application_id },
        data: { transferred_at: new Date() },
      });

      console.log(`[Auth] Auto-provisioned new user from staging: ${email} → ${dbUser.user_id}`);
    }

    // ── 3. Block students on web — UNLESS they are an active executive in any org ─
    // Students who hold an executive rank in an org get web access via tbl_rank_permission.
    if (dbUser.tbl_role?.role_name === 'Student') {
      const execMembership = await prisma.tbl_organization_members.findFirst({
        where: {
          user_id: dbUser.user_id,
          member_type: 'Executive',
          status: 'Active',
        },
        select: { member_id: true },
      });

      if (!execMembership) {
        res.status(403).json({ error: 'STUDENT_WEB_ACCESS_DENIED' });
        return;
      }
    }

    req.user = {
      f_name: dbUser.f_name ?? verified.name?.split(',')[1]?.trim(),
      l_name: dbUser.l_name ?? verified.name?.split(',')[0]?.trim(),
      user_id: dbUser.user_id,
      email: dbUser.email,
    };

    next();
  } catch (error: any) {
    console.error('validateAzureJWT error:', error.message);
    sendAuthError(res, error);
  }
};

/**
 * Require ALL of the listed permissions (cache-aware via permissionService).
 * Optionally scope to an org by passing orgIdResolver.
 *
 * Usage:
 *   router.get('/secret', validateAzureJWT, hasPermission('manage_analytics'), handler)
 *   router.get('/org/:id/members', validateAzureJWT, hasPermission('view_org_members', req => Number(req.params.id)), handler)
 */
export const hasPermission = (
  requiredPermissions: string | string[],
  orgIdResolver: ((req: Request) => number | null) | null = null
) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.user_id ?? req.user?.email ?? req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const orgId = orgIdResolver ? orgIdResolver(req) : null;
      const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

      // All listed permissions must be satisfied
      const checks = await Promise.all(required.map((p) => can(userId, p, orgId)));
      const allowed = checks.every(Boolean);

      if (!allowed) {
        res.status(403).json({ error: 'Access denied', required });
        return;
      }

      next();
    } catch (error: any) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: error.message });
    }
  };

/**
 * Require ANY ONE of the listed permissions.
 */
export const hasAnyPermission = (
  requiredPermissions: string[],
  orgIdResolver: ((req: Request) => number | null) | null = null
) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.user_id ?? req.user?.email ?? req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const orgId = orgIdResolver ? orgIdResolver(req) : null;
      const allowed = await canAny(userId, requiredPermissions, orgId);

      if (!allowed) {
        res.status(403).json({ error: 'Access denied', required: requiredPermissions });
        return;
      }

      next();
    } catch (error: any) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: error.message });
    }
  };

export const requireWebAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.user_id ?? req.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const allowed = await can(userId, 'WEB_ACCESS');
    if (!allowed) {
      res.status(403).json({
        error: 'WEB_ACCESS_DENIED',
        message: 'Your account does not have access to the web application. Please use the mobile app.',
        mobileOnly: true,
      });
      return;
    }

    next();
  } catch (err: any) {
    console.error('[requireWebAccess] error:', err);
    next(err);
  }
};

/**
 * Mobile-specific Azure validator.
 * Keeps identity parity with web (Azure JWT + DB user_id) without web-only student restrictions.
 */
export const validateAzureJWTMobile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | null = null;

  try {
    const allowBodyFallback = parseBoolEnv(process.env.AUTH_ALLOW_BODY_TOKEN_FALLBACK, false);
    token = extractBearerTokenStrict(req, allowBodyFallback);
    const verified = await verifyAzureTokenCore(token, 'mobile');
    const email = verified.preferred_username || verified.email || verified.upn || verified.unique_name;

    if (!email) {
      res.status(401).json({
        error: 'Token missing email claim',
        code: 'MALFORMED_JWT',
      });
      return;
    }

    const candidateEmails = collectCandidateEmails(email, verified, (req.body || {}) as Record<string, unknown>);
    const dbUser = await resolveOrProvisionUserFromEmail(email, verified, candidateEmails);
    if (!dbUser) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[auth:mobile] ACCOUNT_NOT_APPROVED candidates:', candidateEmails);
      }
      res.status(403).json({
        error: 'ACCOUNT_NOT_APPROVED',
        message: 'Your account has not been approved yet. Please contact the SDAO.',
      });
      return;
    }

    if (dbUser.status === 'Suspended') {
      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account is suspended. Please contact the SDAO.',
      });
      return;
    }

    req.user = {
      f_name: dbUser.f_name ?? verified.name?.split(',')[1]?.trim(),
      l_name: dbUser.l_name ?? verified.name?.split(',')[0]?.trim(),
      user_id: dbUser.user_id,
      email: dbUser.email,
      role: dbUser.role_name ?? undefined,
    };

    next();
  } catch (error: any) {
    const allowGraphFallback = parseBoolEnv(process.env.AZURE_MOBILE_ALLOW_GRAPH_ME_FALLBACK, true);

    if (token && allowGraphFallback) {
      try {
        const decoded = decodeTokenMetadata(token);
        const isSignatureFailure = mapVerificationError(error).code === 'INVALID_SIGNATURE';
        const graphAud = isGraphAudience(decoded.payload.aud);

        if (isSignatureFailure && graphAud) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[auth:mobile] falling back to Graph /me validation for Graph audience token');
          }

          const verifiedFromGraph = await verifyGraphTokenViaMe(token);
          const email =
            verifiedFromGraph.preferred_username ||
            verifiedFromGraph.email ||
            verifiedFromGraph.upn ||
            verifiedFromGraph.unique_name;

          if (!email) {
            throw new AuthValidationError('UNAUTHORIZED', 'Graph fallback could not resolve email');
          }

          const candidateEmails = collectCandidateEmails(email, verifiedFromGraph, (req.body || {}) as Record<string, unknown>);
          const dbUser = await resolveOrProvisionUserFromEmail(email, verifiedFromGraph, candidateEmails);
          if (!dbUser) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[auth:mobile] ACCOUNT_NOT_APPROVED (graph fallback) candidates:', candidateEmails);
            }
            res.status(403).json({
              error: 'ACCOUNT_NOT_APPROVED',
              message: 'Your account has not been approved yet. Please contact the SDAO.',
            });
            return;
          }

          if (dbUser.status === 'Suspended') {
            res.status(403).json({
              error: 'ACCOUNT_SUSPENDED',
              message: 'Your account is suspended. Please contact the SDAO.',
            });
            return;
          }

          req.user = {
            f_name: dbUser.f_name ?? verifiedFromGraph.name?.split(',')[1]?.trim(),
            l_name: dbUser.l_name ?? verifiedFromGraph.name?.split(',')[0]?.trim(),
            user_id: dbUser.user_id,
            email: dbUser.email,
            role: dbUser.role_name ?? undefined,
          };

          next();
          return;
        }
      } catch (fallbackErr: any) {
        console.error('validateAzureJWTMobile graph fallback failed:', fallbackErr.message);
      }
    }

    console.error('validateAzureJWTMobile error:', error.message);
    sendAuthError(res, error);
  }
};

/**
 * Enforce mobile write actions as student-only.
 */
export const requireMobileStudentWriteAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    let roleName = req.user?.role;
    if (!roleName) {
      const user = await prisma.tbl_user.findUnique({
        where: { user_id: userId },
        select: {
          tbl_role: { select: { role_name: true } },
        },
      });
      roleName = user?.tbl_role?.role_name ?? undefined;
    }

    if (roleName !== 'Student') {
      res.status(403).json({
        message: 'Forbidden',
        code: 'FORBIDDEN',
        details: 'This mobile action is restricted to student users',
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('requireMobileStudentWriteAccess error:', error.message);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
};

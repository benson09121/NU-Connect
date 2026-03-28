import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import 'dotenv/config';

interface AzureJwtPayload extends jwt.JwtPayload {
  preferred_username?: string;
  sub?: string;
}

async function validateAzureJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization
      ? req.headers.authorization.split(' ')[1]
      : (req.query.access_token as string);

    if (!token) {
      res.status(401).json({ error: 'Token missing' });
      return;
    }

    const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;

    if (!decoded || !decoded.header || !decoded.header.kid) {
      res.status(401).json({ error: 'Invalid token structure' });
      return;
    }

    const client = jwksClient({
      jwksUri: 'https://login.microsoftonline.com/common/discovery/keys',
    });

    const key = await client.getSigningKey(decoded.header.kid as string);
    const publicKey = key.getPublicKey();

    const verified = jwt.verify(token, publicKey, {
      audience: process.env.AZURE_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
    }) as AzureJwtPayload;

    req.user = {
      azureSub: verified.sub,
      email: verified.preferred_username,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export = validateAzureJWT;

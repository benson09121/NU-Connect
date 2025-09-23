const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Auth } = require("../mobile/models/userIdModel");
const jwksClient = require("jwks-rsa");
const userModel = require("../web/models/userModel");

const authMiddleware = async (req, res, next) => {
  console.log('DEBUG AUTH: authMiddleware called for:', req.method, req.url);
  const token = req.headers["authorization"]?.split(" ")[1];
  console.log("DEBUG AUTH: Token:", token ? `${token.substring(0, 20)}...` : 'No token');
  if (!token) {
    console.log("DEBUG AUTH: No token provided, returning 401");
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("DEBUG AUTH: Token verification failed:", err.message);
      return res.status(401).json({ message: "Invalid token" });
    }
    // Adjust for new decoded structure
    const userInfo = decoded.result?.[0]?.user_info;
    if (!userInfo) {
      console.log("DEBUG AUTH: Invalid token structure, decoded:", decoded);
      return res.status(401).json({ message: "Invalid token structure" });
    }
    console.log("DEBUG AUTH: Token verified successfully for user:", userInfo.email);
    req.user = {
      email: userInfo.email,
      first_name: userInfo.f_name,
      last_name: userInfo.l_name,
      role: userInfo.role,
      program_id: userInfo.program_id,
      program_name: userInfo.program_name,
      permissions: userInfo.permissions,
      organizations: userInfo.organizations,
      pending_application: userInfo.pending_application,
    };
    Auth.id = userInfo.email; // If you have user_id, use it here
    Auth.email = userInfo.email;
    Auth.first_name = userInfo.f_name;
    Auth.last_name = userInfo.l_name;
    req.userId = userInfo.email; // If you have user_id, use it here
    next();
  });
};

const validateAzureJWT = async (req, res, next) => {
  try {

    token = req.headers.authorization
            ? req.headers.authorization.split(' ')[1]
            : req.query.access_token;
    if (!token) {
      return res.status(401).json({ error: 'Token missing' });
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return res.status(401).json({ error: 'Invalid token structure' });
    }

    const client = jwksClient({
      jwksUri: 'https://login.microsoftonline.com/common/discovery/keys',
    });

    const key = await client.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    const verified = jwt.verify(token, publicKey, {
      audience: process.env.AZURE_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
    });

    
   
    req.user = {
      f_name: verified.name.split(',')[1],
      l_name: verified.name.split(',')[0],
      user_id: verified.sub, 
      email: verified.preferred_username,
    };
    next();
  } catch (error) {
    console.error('validateAzureJWT error:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

const hasPermission = (requiredPermissions) => async (req, res, next) => {
  try {
      const permissions = await userModel.getPermissions(req.user.email);
      const userPermissions = permissions[0]?.user_info?.permissions || [];
      const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      
      // Parse permissions and check for access
      const hasAny = required.some(requiredPermission => {
          // Check each user permission
          return userPermissions.some(userPerm => {
              // Handle simple string permissions (global permissions)
              if (typeof userPerm === 'string' && userPerm === requiredPermission) {
                  return true;
              }
              
              // Handle JSON string permissions (organization-scoped permissions)
              if (typeof userPerm === 'string' && userPerm.startsWith('{')) {
                  try {
                      const parsedPerm = JSON.parse(userPerm);
                        
                      // Check if permission name matches
                      if (parsedPerm.permission === requiredPermission) {
                          return true; // User has this permission for some organization
                      }
                  } catch (parseError) {
                      console.error('Error parsing permission:', parseError);
                      return false;
                  }
              }
              
              return false;
          });
      });
      
      if (!hasAny) {
          return res.status(403).json({ 
              error: 'Access denied', 
              required: required
          });
      }
      
      next();
  } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: error.message });
  }
};

module.exports = { authMiddleware, validateAzureJWT, hasPermission };




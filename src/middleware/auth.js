const AuthService = require('../services/AuthService');

const authService = new AuthService();

/**
 * JWT Authentication Middleware
 */
const authMiddleware = (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'Authorization header required',
                message: 'Please provide a valid JWT token in the Authorization header'
            });
        }
        
        // Check if it's a Bearer token
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ 
                error: 'Invalid authorization format',
                message: 'Authorization header must be in format: Bearer <token>'
            });
        }
        
        const token = parts[1];
        
        // Verify the JWT token
        const verification = authService.verifyJWT(token);
        
        if (!verification.success) {
            return res.status(401).json({ 
                error: 'Invalid or expired token',
                message: verification.error
            });
        }
        
        // Add user info to request
        req.user = {
            address: verification.payload.address,
            type: verification.payload.type,
            iat: verification.payload.iat
        };
        
        // Add token to request for potential refresh
        req.token = token;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            error: 'Authentication error',
            message: 'Internal server error during authentication'
        });
    }
};

/**
 * Optional Authentication Middleware
 * Adds user info if token is present, but doesn't require it
 */
const optionalAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            req.user = null;
            return next();
        }
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            req.user = null;
            return next();
        }
        
        const token = parts[1];
        const verification = authService.verifyJWT(token);
        
        if (verification.success) {
            req.user = {
                address: verification.payload.address,
                type: verification.payload.type,
                iat: verification.payload.iat
            };
            req.token = token;
        } else {
            req.user = null;
        }
        
        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        req.user = null;
        next();
    }
};

/**
 * API Key Authentication Middleware
 * For service-to-service communication
 */
const apiKeyMiddleware = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
            return res.status(401).json({ 
                error: 'API key required',
                message: 'Please provide a valid API key in x-api-key header or apiKey query parameter'
            });
        }
        
        const validation = authService.validateApiKey(apiKey);
        
        if (!validation.valid) {
            return res.status(401).json({ 
                error: 'Invalid API key',
                message: 'The provided API key is not valid'
            });
        }
        
        req.apiClient = {
            identifier: validation.identifier,
            type: 'api_key'
        };
        
        next();
    } catch (error) {
        console.error('API key middleware error:', error);
        res.status(500).json({ 
            error: 'API key validation error',
            message: 'Internal server error during API key validation'
        });
    }
};

/**
 * Document Authorization Middleware
 * Checks if user is authorized to access/modify a specific document
 */
const documentAuthMiddleware = (requiredRole = 'signer') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    message: 'Please authenticate to access this document'
                });
            }
            
            const { documentHash } = req.params;
            
            if (!documentHash) {
                return res.status(400).json({ 
                    error: 'Document hash required',
                    message: 'Document hash must be provided in the URL path'
                });
            }
            
            // This would typically check against a database or smart contract
            // For now, this is a placeholder implementation
            
            const userAddress = req.user.address;
            
            // In a real implementation, you would:
            // 1. Get document details from smart contract
            // 2. Check if user is authorized (signer, creator, etc.)
            // 3. Verify document status (active, expired, etc.)
            
            // Placeholder: assume user is authorized if they have a valid token
            req.documentAccess = {
                documentHash,
                userAddress,
                role: requiredRole,
                authorized: true
            };
            
            next();
        } catch (error) {
            console.error('Document auth middleware error:', error);
            res.status(500).json({ 
                error: 'Document authorization error',
                message: 'Internal server error during document authorization'
            });
        }
    };
};

/**
 * Rate Limiting Middleware
 * Simple in-memory rate limiting (use Redis in production)
 */
const rateLimitStore = new Map();

const rateLimitMiddleware = (options = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        maxRequests = 100,
        message = 'Too many requests, please try again later'
    } = options;
    
    return (req, res, next) => {
        try {
            const identifier = req.user?.address || req.ip;
            const now = Date.now();
            const windowStart = now - windowMs;
            
            // Clean old entries
            if (rateLimitStore.has(identifier)) {
                const requests = rateLimitStore.get(identifier);
                const validRequests = requests.filter(timestamp => timestamp > windowStart);
                rateLimitStore.set(identifier, validRequests);
            }
            
            // Get current request count
            const currentRequests = rateLimitStore.get(identifier) || [];
            
            if (currentRequests.length >= maxRequests) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message,
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }
            
            // Add current request
            currentRequests.push(now);
            rateLimitStore.set(identifier, currentRequests);
            
            // Add rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - currentRequests.length),
                'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
            });
            
            next();
        } catch (error) {
            console.error('Rate limit middleware error:', error);
            next(); // Continue on error
        }
    };
};

/**
 * Role-based Authorization Middleware
 */
const roleMiddleware = (requiredRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    error: 'Authentication required' 
                });
            }
            
            const userRole = req.user.role || 'user';
            const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
            
            if (!roles.includes(userRole)) {
                return res.status(403).json({ 
                    error: 'Insufficient permissions',
                    message: `Required role(s): ${roles.join(', ')}. User role: ${userRole}`
                });
            }
            
            next();
        } catch (error) {
            console.error('Role middleware error:', error);
            res.status(500).json({ 
                error: 'Authorization error' 
            });
        }
    };
};

module.exports = {
    authMiddleware,
    optionalAuthMiddleware,
    apiKeyMiddleware,
    documentAuthMiddleware,
    rateLimitMiddleware,
    roleMiddleware
};
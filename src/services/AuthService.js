const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const crypto = require('crypto');

class AuthService {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-this';
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
        
        // In-memory session storage (use Redis in production)
        this.sessions = new Map();
        this.nonces = new Map();
    }
    
    /**
     * Generate a nonce for wallet signature authentication
     */
    generateNonce(address) {
        const nonce = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        
        this.nonces.set(address.toLowerCase(), {
            nonce,
            expiresAt
        });
        
        return nonce;
    }
    
    /**
     * Create authentication message for wallet signing
     */
    createAuthMessage(address, nonce) {
        return `Sign this message to authenticate with Document Signature Service.

Address: ${address}
Nonce: ${nonce}
Timestamp: ${new Date().toISOString()}

This request will not trigger any blockchain transaction or cost any gas fees.`;
    }
    
    /**
     * Verify wallet signature and create JWT token
     */
    async authenticateWithWallet(address, signature, nonce) {
        try {
            const addressLower = address.toLowerCase();
            const storedNonce = this.nonces.get(addressLower);
            
            // Check if nonce exists and is not expired
            if (!storedNonce) {
                throw new Error('Invalid or expired nonce');
            }
            
            if (Date.now() > storedNonce.expiresAt) {
                this.nonces.delete(addressLower);
                throw new Error('Nonce expired');
            }
            
            if (storedNonce.nonce !== nonce) {
                throw new Error('Invalid nonce');
            }
            
            // Create the message that was signed
            const message = this.createAuthMessage(address, nonce);
            
            // Verify the signature
            const recoveredAddress = ethers.utils.verifyMessage(message, signature);
            
            if (recoveredAddress.toLowerCase() !== addressLower) {
                throw new Error('Invalid signature');
            }
            
            // Clean up used nonce
            this.nonces.delete(addressLower);
            
            // Create JWT token
            const token = this.createJWT(address);
            
            // Store session
            const sessionId = crypto.randomUUID();
            this.sessions.set(sessionId, {
                address: addressLower,
                token,
                createdAt: Date.now(),
                lastActivity: Date.now()
            });
            
            return {
                success: true,
                token,
                address: recoveredAddress,
                sessionId
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Create JWT token
     */
    createJWT(address) {
        const payload = {
            address: address.toLowerCase(),
            type: 'wallet_auth',
            iat: Math.floor(Date.now() / 1000)
        };
        
        return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
    }
    
    /**
     * Verify JWT token
     */
    verifyJWT(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            return {
                success: true,
                payload: decoded
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Refresh JWT token
     */
    refreshToken(oldToken) {
        const verification = this.verifyJWT(oldToken);
        
        if (!verification.success) {
            return {
                success: false,
                error: 'Invalid token'
            };
        }
        
        // Create new token
        const newToken = this.createJWT(verification.payload.address);
        
        return {
            success: true,
            token: newToken,
            address: verification.payload.address
        };
    }
    
    /**
     * Validate session and update activity
     */
    validateSession(sessionId, address) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            return false;
        }
        
        if (session.address !== address.toLowerCase()) {
            return false;
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        
        return true;
    }
    
    /**
     * Revoke session
     */
    revokeSession(sessionId) {
        return this.sessions.delete(sessionId);
    }
    
    /**
     * Clean up expired nonces and sessions
     */
    cleanup() {
        const now = Date.now();
        
        // Clean expired nonces
        for (const [address, nonceData] of this.nonces.entries()) {
            if (now > nonceData.expiresAt) {
                this.nonces.delete(address);
            }
        }
        
        // Clean old sessions (24 hours of inactivity)
        const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastActivity > sessionTimeout) {
                this.sessions.delete(sessionId);
            }
        }
    }
    
    /**
     * Get user info from token
     */
    getUserFromToken(token) {
        const verification = this.verifyJWT(token);
        
        if (!verification.success) {
            return null;
        }
        
        return {
            address: verification.payload.address,
            type: verification.payload.type
        };
    }
    
    /**
     * Check if address is authorized for specific document
     */
    async isAuthorizedForDocument(address, documentHash, requiredSigners = []) {
        const addressLower = address.toLowerCase();
        
        // Check if address is in the required signers list
        const isRequiredSigner = requiredSigners.some(
            signer => signer.toLowerCase() === addressLower
        );
        
        return isRequiredSigner;
    }
    
    /**
     * Generate API key for service-to-service authentication
     */
    generateApiKey(identifier) {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        // In production, store this in a database
        console.log(`Generated API key for ${identifier}: ${apiKey}`);
        console.log(`Hash to store: ${hash}`);
        
        return apiKey;
    }
    
    /**
     * Validate API key
     */
    validateApiKey(apiKey) {
        // In production, compare hash with stored value
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        // This is a placeholder - implement your API key storage logic
        return {
            valid: false,
            identifier: null
        };
    }
}

// Start cleanup interval
const authService = new AuthService();
setInterval(() => {
    authService.cleanup();
}, 10 * 60 * 1000); // Clean up every 10 minutes

module.exports = AuthService;
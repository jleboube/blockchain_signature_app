const { ethers } = require('ethers');

/**
 * Validate Ethereum address format
 */
const isValidAddress = (address) => {
    try {
        return ethers.utils.isAddress(address);
    } catch (error) {
        return false;
    }
};

/**
 * Validate document hash format (SHA-256)
 */
const isValidDocumentHash = (hash) => {
    return typeof hash === 'string' && /^[a-fA-F0-9]{64}$/.test(hash);
};

/**
 * Validate IPFS hash format
 */
const isValidIPFSHash = (hash) => {
    // Basic validation for IPFS hash formats (v0 and v1)
    const ipfsV0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const ipfsV1Regex = /^b[a-z2-7]{58}$/;
    
    return typeof hash === 'string' && (ipfsV0Regex.test(hash) || ipfsV1Regex.test(hash));
};

/**
 * Document Creation Validation Middleware
 */
const validateDocumentCreation = (req, res, next) => {
    const errors = [];
    
    try {
        const { signers, title, description, expiresAt } = req.body;
        
        // Validate signers
        if (!signers) {
            errors.push('Signers array is required');
        } else {
            try {
                const signersArray = JSON.parse(signers);
                
                if (!Array.isArray(signersArray)) {
                    errors.push('Signers must be an array');
                } else if (signersArray.length === 0) {
                    errors.push('At least one signer is required');
                } else if (signersArray.length > 50) {
                    errors.push('Maximum 50 signers allowed');
                } else {
                    // Validate each address
                    const invalidAddresses = [];
                    const duplicates = new Set();
                    const seen = new Set();
                    
                    for (let i = 0; i < signersArray.length; i++) {
                        const address = signersArray[i];
                        
                        if (typeof address !== 'string') {
                            invalidAddresses.push(`Index ${i}: must be a string`);
                            continue;
                        }
                        
                        if (!isValidAddress(address)) {
                            invalidAddresses.push(`Index ${i}: invalid Ethereum address format`);
                            continue;
                        }
                        
                        const normalizedAddress = address.toLowerCase();
                        if (seen.has(normalizedAddress)) {
                            duplicates.add(address);
                        }
                        seen.add(normalizedAddress);
                    }
                    
                    if (invalidAddresses.length > 0) {
                        errors.push(`Invalid signer addresses: ${invalidAddresses.join(', ')}`);
                    }
                    
                    if (duplicates.size > 0) {
                        errors.push(`Duplicate signers found: ${Array.from(duplicates).join(', ')}`);
                    }
                }
            } catch (parseError) {
                errors.push('Signers must be valid JSON array');
            }
        }
        
        // Validate title (optional)
        if (title !== undefined) {
            if (typeof title !== 'string') {
                errors.push('Title must be a string');
            } else if (title.length > 200) {
                errors.push('Title must be 200 characters or less');
            }
        }
        
        // Validate description (optional)
        if (description !== undefined) {
            if (typeof description !== 'string') {
                errors.push('Description must be a string');
            } else if (description.length > 1000) {
                errors.push('Description must be 1000 characters or less');
            }
        }
        
        // Validate expiration date (optional)
        if (expiresAt !== undefined) {
            if (typeof expiresAt !== 'string') {
                errors.push('Expiration date must be a string');
            } else {
                const expirationDate = new Date(expiresAt);
                if (isNaN(expirationDate.getTime())) {
                    errors.push('Invalid expiration date format');
                } else if (expirationDate <= new Date()) {
                    errors.push('Expiration date must be in the future');
                }
            }
        }
        
        // Check file
        if (!req.file) {
            errors.push('Document file is required');
        } else {
            // Validate file size (already handled by multer, but double-check)
            if (req.file.size > 50 * 1024 * 1024) { // 50MB
                errors.push('File size must be 50MB or less');
            }
            
            // Validate filename
            if (req.file.originalname.length > 255) {
                errors.push('Filename must be 255 characters or less');
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                errors
            });
        }
        
        next();
    } catch (error) {
        console.error('Validation middleware error:', error);
        res.status(500).json({
            error: 'Validation error',
            message: 'Internal server error during validation'
        });
    }
};

/**
 * Document Signature Validation Middleware
 */
const validateSignature = (req, res, next) => {
    const errors = [];
    
    try {
        const { documentHash } = req.params;
        const { signatureMetadata, signatureData } = req.body;
        
        // Validate document hash
        if (!documentHash) {
            errors.push('Document hash is required in URL path');
        } else if (!isValidDocumentHash(documentHash)) {
            errors.push('Invalid document hash format (must be 64-character hex string)');
        }
        
        // Validate signature metadata (optional)
        if (signatureMetadata !== undefined) {
            if (typeof signatureMetadata !== 'object' || signatureMetadata === null) {
                errors.push('Signature metadata must be an object');
            } else {
                // Check metadata size
                const metadataString = JSON.stringify(signatureMetadata);
                if (metadataString.length > 10000) {
                    errors.push('Signature metadata must be 10KB or less');
                }
                
                // Validate specific metadata fields if present
                if (signatureMetadata.timestamp && typeof signatureMetadata.timestamp !== 'string') {
                    errors.push('Metadata timestamp must be a string');
                }
                
                if (signatureMetadata.reason && typeof signatureMetadata.reason !== 'string') {
                    errors.push('Metadata reason must be a string');
                }
                
                if (signatureMetadata.location && typeof signatureMetadata.location !== 'string') {
                    errors.push('Metadata location must be a string');
                }
            }
        }
        
        // Validate signature data (optional)
        if (signatureData !== undefined) {
            if (typeof signatureData !== 'object' || signatureData === null) {
                errors.push('Signature data must be an object');
            } else {
                // Check for required signature fields
                if (signatureData.r && typeof signatureData.r !== 'string') {
                    errors.push('Signature r component must be a string');
                }
                
                if (signatureData.s && typeof signatureData.s !== 'string') {
                    errors.push('Signature s component must be a string');
                }
                
                if (signatureData.v && typeof signatureData.v !== 'number') {
                    errors.push('Signature v component must be a number');
                }
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Signature validation failed',
                errors
            });
        }
        
        next();
    } catch (error) {
        console.error('Signature validation middleware error:', error);
        res.status(500).json({
            error: 'Signature validation error',
            message: 'Internal server error during signature validation'
        });
    }
};

/**
 * Address Validation Middleware
 */
const validateAddress = (paramName = 'address') => {
    return (req, res, next) => {
        try {
            const address = req.params[paramName];
            
            if (!address) {
                return res.status(400).json({
                    error: 'Address parameter required',
                    parameter: paramName
                });
            }
            
            if (!isValidAddress(address)) {
                return res.status(400).json({
                    error: 'Invalid Ethereum address format',
                    parameter: paramName,
                    value: address
                });
            }
            
            // Normalize the address
            req.params[paramName] = ethers.utils.getAddress(address);
            
            next();
        } catch (error) {
            console.error('Address validation middleware error:', error);
            res.status(500).json({
                error: 'Address validation error',
                message: 'Internal server error during address validation'
            });
        }
    };
};

/**
 * Document Hash Validation Middleware
 */
const validateDocumentHash = (paramName = 'documentHash') => {
    return (req, res, next) => {
        try {
            const hash = req.params[paramName];
            
            if (!hash) {
                return res.status(400).json({
                    error: 'Document hash parameter required',
                    parameter: paramName
                });
            }
            
            if (!isValidDocumentHash(hash)) {
                return res.status(400).json({
                    error: 'Invalid document hash format (must be 64-character hex string)',
                    parameter: paramName,
                    value: hash
                });
            }
            
            next();
        } catch (error) {
            console.error('Document hash validation middleware error:', error);
            res.status(500).json({
                error: 'Document hash validation error',
                message: 'Internal server error during document hash validation'
            });
        }
    };
};

/**
 * Pagination Validation Middleware
 */
const validatePagination = (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        
        const errors = [];
        
        if (isNaN(pageNum) || pageNum < 1) {
            errors.push('Page must be a positive integer');
        }
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            errors.push('Limit must be an integer between 1 and 100');
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Pagination validation failed',
                errors
            });
        }
        
        req.pagination = {
            page: pageNum,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum
        };
        
        next();
    } catch (error) {
        console.error('Pagination validation middleware error:', error);
        res.status(500).json({
            error: 'Pagination validation error',
            message: 'Internal server error during pagination validation'
        });
    }
};

/**
 * Body Size Validation Middleware
 */
const validateBodySize = (maxSize = 1024 * 1024) => { // 1MB default
    return (req, res, next) => {
        try {
            const contentLength = parseInt(req.headers['content-length'], 10);
            
            if (contentLength > maxSize) {
                return res.status(413).json({
                    error: 'Request body too large',
                    maxSize,
                    receivedSize: contentLength
                });
            }
            
            next();
        } catch (error) {
            console.error('Body size validation middleware error:', error);
            next(); // Continue on error
        }
    };
};

/**
 * Content Type Validation Middleware
 */
const validateContentType = (allowedTypes) => {
    return (req, res, next) => {
        try {
            const contentType = req.headers['content-type'];
            
            if (!contentType) {
                return res.status(400).json({
                    error: 'Content-Type header required'
                });
            }
            
            const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
            const isAllowed = types.some(type => contentType.startsWith(type));
            
            if (!isAllowed) {
                return res.status(415).json({
                    error: 'Unsupported content type',
                    allowed: types,
                    received: contentType
                });
            }
            
            next();
        } catch (error) {
            console.error('Content type validation middleware error:', error);
            res.status(500).json({
                error: 'Content type validation error',
                message: 'Internal server error during content type validation'
            });
        }
    };
};

module.exports = {
    validateDocumentCreation,
    validateSignature,
    validateAddress,
    validateDocumentHash,
    validatePagination,
    validateBodySize,
    validateContentType,
    isValidAddress,
    isValidDocumentHash,
    isValidIPFSHash
};
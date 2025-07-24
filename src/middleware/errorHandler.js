/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */

/**
 * Development Error Handler
 * Shows detailed error information including stack traces
 */
const developmentErrorHandler = (err, req, res, next) => {
    console.error('Development Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    
    res.status(err.status || 500).json({
        error: {
            message: err.message,
            stack: err.stack,
            status: err.status || 500,
            type: err.name || 'Error',
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        }
    });
};

/**
 * Production Error Handler
 * Shows minimal error information for security
 */
const productionErrorHandler = (err, req, res, next) => {
    // Log error details internally
    console.error('Production Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        userId: req.user?.address
    });
    
    // Only show safe error messages in production
    const safeErrors = {
        ValidationError: true,
        CastError: true,
        UnauthorizedError: true,
        ForbiddenError: true,
        NotFoundError: true,
        ConflictError: true,
        BadRequestError: true
    };
    
    const status = err.status || err.statusCode || 500;
    const message = safeErrors[err.name] || status < 500 
        ? err.message 
        : 'Internal server error';
    
    res.status(status).json({
        error: {
            message,
            status,
            timestamp: new Date().toISOString()
        }
    });
};

/**
 * Async Error Handler
 * Wraps async route handlers to catch rejected promises
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    error.status = 404;
    error.name = 'NotFoundError';
    next(error);
};

/**
 * Blockchain Error Handler
 * Handles specific blockchain-related errors
 */
const blockchainErrorHandler = (err, req, res, next) => {
    // Handle specific blockchain errors
    if (err.message?.includes('insufficient funds')) {
        err.status = 402;
        err.message = 'Insufficient funds for blockchain transaction';
        err.name = 'InsufficientFundsError';
    } else if (err.message?.includes('gas')) {
        err.status = 402;
        err.message = 'Gas estimation failed or insufficient gas';
        err.name = 'GasError';
    } else if (err.message?.includes('nonce')) {
        err.status = 409;
        err.message = 'Transaction nonce conflict';
        err.name = 'NonceError';
    } else if (err.message?.includes('replacement transaction underpriced')) {
        err.status = 409;
        err.message = 'Transaction replacement underpriced';
        err.name = 'UnderpricedError';
    } else if (err.message?.includes('already known')) {
        err.status = 409;
        err.message = 'Transaction already submitted';
        err.name = 'DuplicateTransactionError';
    } else if (err.message?.includes('reverted')) {
        err.status = 400;
        err.message = 'Smart contract execution failed';
        err.name = 'ContractRevertError';
    }
    
    next(err);
};

/**
 * Multer Error Handler
 * Handles file upload errors
 */
const multerErrorHandler = (err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        err.status = 413;
        err.message = `File too large. Maximum size is ${err.field?.fileSize || '50MB'}`;
        err.name = 'FileSizeError';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
        err.status = 400;
        err.message = 'Too many files uploaded';
        err.name = 'FileCountError';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        err.status = 400;
        err.message = 'Unexpected file field';
        err.name = 'UnexpectedFileError';
    } else if (err.message?.includes('Unsupported file type')) {
        err.status = 415;
        err.name = 'UnsupportedFileTypeError';
    }
    
    next(err);
};

/**
 * Validation Error Handler
 * Handles validation errors from middleware
 */
const validationErrorHandler = (err, req, res, next) => {
    if (err.name === 'ValidationError') {
        err.status = 400;
        
        // Handle Joi validation errors
        if (err.details) {
            err.message = err.details.map(detail => detail.message).join(', ');
        }
    } else if (err.name === 'CastError') {
        err.status = 400;
        err.message = `Invalid ${err.path}: ${err.value}`;
        err.name = 'ValidationError';
    }
    
    next(err);
};

/**
 * JWT Error Handler
 * Handles JWT-related authentication errors
 */
const jwtErrorHandler = (err, req, res, next) => {
    if (err.name === 'JsonWebTokenError') {
        err.status = 401;
        err.message = 'Invalid token';
        err.name = 'UnauthorizedError';
    } else if (err.name === 'TokenExpiredError') {
        err.status = 401;
        err.message = 'Token expired';
        err.name = 'UnauthorizedError';
    } else if (err.name === 'NotBeforeError') {
        err.status = 401;
        err.message = 'Token not active';
        err.name = 'UnauthorizedError';
    }
    
    next(err);
};

/**
 * IPFS Error Handler
 * Handles IPFS-related errors
 */
const ipfsErrorHandler = (err, req, res, next) => {
    if (err.message?.includes('IPFS')) {
        if (err.message.includes('timeout')) {
            err.status = 504;
            err.message = 'IPFS request timeout';
            err.name = 'IPFSTimeoutError';
        } else if (err.message.includes('not found')) {
            err.status = 404;
            err.message = 'File not found in IPFS';
            err.name = 'IPFSNotFoundError';
        } else {
            err.status = 502;
            err.message = 'IPFS service unavailable';
            err.name = 'IPFSError';
        }
    }
    
    next(err);
};

/**
 * Rate Limit Error Handler
 */
const rateLimitErrorHandler = (err, req, res, next) => {
    if (err.status === 429 || err.name === 'RateLimitError') {
        res.status(429).json({
            error: {
                message: 'Too many requests',
                status: 429,
                retryAfter: err.retryAfter || 60,
                timestamp: new Date().toISOString()
            }
        });
        return;
    }
    
    next(err);
};

/**
 * Custom Error Classes
 */
class BlockchainError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'BlockchainError';
        this.status = 502;
        this.originalError = originalError;
    }
}

class ValidationError extends Error {
    constructor(message, fields = []) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
        this.fields = fields;
    }
}

class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
        this.status = 401;
    }
}

class ForbiddenError extends Error {
    constructor(message = 'Forbidden') {
        super(message);
        this.name = 'ForbiddenError';
        this.status = 403;
    }
}

class NotFoundError extends Error {
    constructor(message = 'Not found') {
        super(message);
        this.name = 'NotFoundError';
        this.status = 404;
    }
}

class ConflictError extends Error {
    constructor(message = 'Conflict') {
        super(message);
        this.name = 'ConflictError';
        this.status = 409;
    }
}

class BadRequestError extends Error {
    constructor(message = 'Bad request') {
        super(message);
        this.name = 'BadRequestError';
        this.status = 400;
    }
}

/**
 * Main Error Handler Pipeline
 * Processes errors through various handlers before sending response
 */
const errorHandler = (err, req, res, next) => {
    // Apply specific error handlers
    rateLimitErrorHandler(err, req, res, (err) => {
        if (res.headersSent) return;
        
        blockchainErrorHandler(err, req, res, (err) => {
            multerErrorHandler(err, req, res, (err) => {
                validationErrorHandler(err, req, res, (err) => {
                    jwtErrorHandler(err, req, res, (err) => {
                        ipfsErrorHandler(err, req, res, (err) => {
                            // Use development or production handler
                            const handler = process.env.NODE_ENV === 'production' 
                                ? productionErrorHandler 
                                : developmentErrorHandler;
                            
                            handler(err, req, res, next);
                        });
                    });
                });
            });
        });
    });
};

/**
 * Graceful Shutdown Handler
 * Handles process termination gracefully
 */
const gracefulShutdown = (server) => {
    const shutdown = (signal) => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        
        server.close((err) => {
            if (err) {
                console.error('Error during server shutdown:', err);
                process.exit(1);
            }
            
            console.log('Server closed successfully');
            process.exit(0);
        });
        
        // Force shutdown after 30 seconds
        setTimeout(() => {
            console.error('Forcing shutdown after timeout');
            process.exit(1);
        }, 30000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * Unhandled Promise Rejection Handler
 */
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
    
    if (process.env.NODE_ENV === 'production') {
        // In production, exit the process
        console.error('Shutting down due to unhandled promise rejection');
        process.exit(1);
    }
});

/**
 * Uncaught Exception Handler
 */
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Always exit on uncaught exceptions
    console.error('Shutting down due to uncaught exception');
    process.exit(1);
});

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    gracefulShutdown,
    
    // Custom error classes
    BlockchainError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    BadRequestError,
    
    // Individual handlers for testing
    developmentErrorHandler,
    productionErrorHandler,
    blockchainErrorHandler,
    multerErrorHandler,
    validationErrorHandler,
    jwtErrorHandler,
    ipfsErrorHandler,
    rateLimitErrorHandler
};
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

const DocumentSignatureService = require('./services/DocumentSignatureService');
const { errorHandler, notFoundHandler, gracefulShutdown } = require('./middleware/errorHandler');
const { rateLimitMiddleware } = require('./middleware/auth');
const { FEATURE_FLAGS, DEFAULTS, SECURITY_HEADERS } = require('./utils/constants');

// Import routes
const documentsRoutes = require('./routes/documents');
const signaturesRoutes = require('./routes/signatures');
const healthRoutes = require('./routes/health');

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO if enabled
let io;
if (FEATURE_FLAGS.ENABLE_WEBSOCKETS) {
    io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"]
        },
        transports: ['websocket', 'polling']
    });
}

// Security middleware
if (FEATURE_FLAGS.ENABLE_HELMET) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false
    }));
}

// CORS middleware
if (FEATURE_FLAGS.ENABLE_CORS) {
    app.use(cors({
        origin: process.env.CORS_ORIGIN || "*",
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
        credentials: true
    }));
}

// Compression middleware
if (FEATURE_FLAGS.ENABLE_COMPRESSION) {
    app.use(compression());
}

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
if (FEATURE_FLAGS.ENABLE_LOGGING && process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        });
        
        next();
    });
}

// Global rate limiting
if (FEATURE_FLAGS.ENABLE_RATE_LIMITING) {
    app.use(rateLimitMiddleware({
        windowMs: process.env.RATE_LIMIT_WINDOW || DEFAULTS.RATE_LIMIT_WINDOW,
        maxRequests: process.env.RATE_LIMIT_MAX || DEFAULTS.RATE_LIMIT_MAX,
        message: 'Too many requests from this IP, please try again later'
    }));
}

// Health check endpoint (before other routes for faster response)
app.use('/api/health', healthRoutes);

// API routes
app.use('/api/documents', documentsRoutes);
app.use('/api/signatures', signaturesRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Document Signature API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Blockchain-based document signature validation system',
        endpoints: {
            health: {
                'GET /api/health': 'Basic health check',
                'GET /api/health/detailed': 'Comprehensive health check',
                'GET /api/health/blockchain': 'Blockchain connectivity check',
                'GET /api/health/ipfs': 'IPFS service check',
                'GET /api/health/contract': 'Smart contract check',
                'GET /api/health/config': 'Configuration check'
            },
            documents: {
                'POST /api/documents': 'Create new document for signing',
                'GET /api/documents/:hash': 'Get document status',
                'GET /api/documents/:hash/signers': 'Get required signers',
                'GET /api/documents/:hash/download': 'Download document',
                'POST /api/documents/estimate-cost': 'Estimate gas costs'
            },
            signatures: {
                'POST /api/signatures/:hash/sign': 'Sign a document',
                'GET /api/signatures/:hash': 'Get all signatures',
                'GET /api/signatures/:hash/:address': 'Get specific signature',
                'POST /api/signatures/:hash/verify': 'Verify all signatures'
            }
        },
        authentication: {
            type: 'JWT Bearer Token',
            header: 'Authorization: Bearer <token>',
            note: 'Obtain token through wallet signature authentication'
        },
        websocket: {
            enabled: FEATURE_FLAGS.ENABLE_WEBSOCKETS,
            events: [
                'document:created',
                'document:signed',
                'document:completed',
                'signature:update'
            ]
        }
    });
});

// WebSocket handling
if (io) {
    // Track connected clients
    const connectedClients = new Map();
    
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);
        connectedClients.set(socket.id, {
            connectedAt: new Date(),
            subscriptions: new Set()
        });
        
        // Handle document subscription
        socket.on('subscribe', (data) => {
            try {
                const { documentHash, userAddress } = data;
                
                if (documentHash) {
                    socket.join(`document:${documentHash}`);
                    connectedClients.get(socket.id).subscriptions.add(documentHash);
                    console.log(`Client ${socket.id} subscribed to document ${documentHash}`);
                    
                    socket.emit('subscribed', {
                        documentHash,
                        message: 'Successfully subscribed to document updates'
                    });
                }
            } catch (error) {
                console.error('Subscription error:', error);
                socket.emit('error', { message: 'Subscription failed' });
            }
        });
        
        // Handle unsubscribe
        socket.on('unsubscribe', (data) => {
            try {
                const { documentHash } = data;
                
                if (documentHash) {
                    socket.leave(`document:${documentHash}`);
                    const client = connectedClients.get(socket.id);
                    if (client) {
                        client.subscriptions.delete(documentHash);
                    }
                    
                    socket.emit('unsubscribed', {
                        documentHash,
                        message: 'Successfully unsubscribed from document updates'
                    });
                }
            } catch (error) {
                console.error('Unsubscribe error:', error);
                socket.emit('error', { message: 'Unsubscribe failed' });
            }
        });
        
        // Handle heartbeat
        socket.on('heartbeat', () => {
            socket.emit('heartbeat', { timestamp: new Date().toISOString() });
        });
        
        // Handle disconnect
        socket.on('disconnect', (reason) => {
            console.log(`Client disconnected: ${socket.id} (${reason})`);
            connectedClients.delete(socket.id);
        });
    });
    
    // Initialize blockchain event listening
    try {
        if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS && process.env.PRIVATE_KEY) {
            const signatureService = new DocumentSignatureService({
                rpcUrl: process.env.RPC_URL,
                privateKey: process.env.PRIVATE_KEY,
                contractAddress: process.env.CONTRACT_ADDRESS
            });
            
            // Listen for blockchain events and broadcast to WebSocket clients
            signatureService.listenForSignatureEvents((event) => {
                console.log('Broadcasting blockchain event:', event.type);
                
                // Emit to specific document subscribers
                if (event.documentHash) {
                    io.to(`document:${event.documentHash}`).emit('blockchain:event', event);
                }
                
                // Emit to all connected clients
                io.emit('blockchain:update', {
                    type: event.type,
                    timestamp: new Date().toISOString(),
                    data: event
                });
            });
        }
    } catch (error) {
        console.error('Failed to initialize blockchain event listener:', error.message);
    }
    
    // Expose WebSocket stats endpoint
    app.get('/api/websocket/stats', (req, res) => {
        const stats = {
            connectedClients: connectedClients.size,
            totalSubscriptions: Array.from(connectedClients.values())
                .reduce((total, client) => total + client.subscriptions.size, 0),
            clients: Array.from(connectedClients.entries()).map(([id, client]) => ({
                id,
                connectedAt: client.connectedAt,
                subscriptions: Array.from(client.subscriptions)
            }))
        };
        
        res.json(stats);
    });
}

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Server configuration
const port = process.env.PORT || DEFAULTS.PORT;
const host = process.env.HOST || DEFAULTS.HOST;

// Start server
if (process.env.NODE_ENV !== 'test') {
    server.listen(port, host, () => {
        console.log('🚀 Document Signature API Server Started');
        console.log(`📍 Server running on http://${host}:${port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Blockchain: ${process.env.RPC_URL ? 'Connected' : 'Not configured'}`);
        console.log(`📄 Contract: ${process.env.CONTRACT_ADDRESS || 'Not configured'}`);
        console.log(`🌐 WebSocket: ${FEATURE_FLAGS.ENABLE_WEBSOCKETS ? 'Enabled' : 'Disabled'}`);
        console.log(`🛡️  CORS: ${FEATURE_FLAGS.ENABLE_CORS ? 'Enabled' : 'Disabled'}`);
        console.log(`⏱️  Rate Limiting: ${FEATURE_FLAGS.ENABLE_RATE_LIMITING ? 'Enabled' : 'Disabled'}`);
        console.log('\n📚 API Documentation available at: /api');
        console.log('🏥 Health checks available at: /api/health');
        
        if (process.env.NODE_ENV === 'development') {
            console.log('\n🔧 Development mode - detailed error messages enabled');
            console.log('🔍 Request logging enabled');
        }
        
        console.log('\n✅ Server ready to accept requests\n');
    });
    
    // Setup graceful shutdown
    gracefulShutdown(server);
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

// Export app for testing
module.exports = app;
const express = require('express');
const { ethers } = require('ethers');
const DocumentSignatureService = require('../services/DocumentSignatureService');
const IPFSService = require('../services/IPFSService');

const router = express.Router();

// Initialize services for health checks
let signatureService;
let ipfsService;

try {
    signatureService = new DocumentSignatureService({
        rpcUrl: process.env.RPC_URL,
        privateKey: process.env.PRIVATE_KEY,
        contractAddress: process.env.CONTRACT_ADDRESS
    });
    
    ipfsService = new IPFSService({
        provider: process.env.IPFS_PROVIDER || 'pinata',
        pinataApiKey: process.env.PINATA_API_KEY,
        pinataSecretKey: process.env.PINATA_SECRET_KEY
    });
} catch (error) {
    console.warn('Failed to initialize services for health checks:', error.message);
}

/**
 * GET /api/health
 * Basic health check endpoint
 */
router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    });
});

/**
 * GET /api/health/detailed
 * Comprehensive health check including external services
 */
router.get('/detailed', async (req, res) => {
    const healthResults = {
        status: 'unknown',
        timestamp: new Date().toISOString(),
        services: {},
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development'
        }
    };
    
    // Check API server health
    healthResults.services.api = {
        status: 'healthy',
        responseTime: 0
    };
    
    // Check blockchain connectivity
    try {
        if (signatureService) {
            const start = Date.now();
            const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
            const blockNumber = await provider.getBlockNumber();
            const responseTime = Date.now() - start;
            
            healthResults.services.blockchain = {
                status: 'healthy',
                network: await provider.getNetwork(),
                currentBlock: blockNumber,
                rpcUrl: process.env.RPC_URL ? 'configured' : 'missing',
                responseTime
            };
        } else {
            healthResults.services.blockchain = {
                status: 'unavailable',
                error: 'Service not initialized'
            };
        }
    } catch (error) {
        healthResults.services.blockchain = {
            status: 'unhealthy',
            error: error.message,
            rpcUrl: process.env.RPC_URL ? 'configured' : 'missing'
        };
    }
    
    // Check smart contract
    try {
        if (signatureService && process.env.CONTRACT_ADDRESS) {
            const start = Date.now();
            const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
            const code = await provider.getCode(process.env.CONTRACT_ADDRESS);
            const responseTime = Date.now() - start;
            
            healthResults.services.smartContract = {
                status: code === '0x' ? 'not_deployed' : 'healthy',
                address: process.env.CONTRACT_ADDRESS,
                codeSize: code.length,
                responseTime
            };
        } else {
            healthResults.services.smartContract = {
                status: 'not_configured',
                address: process.env.CONTRACT_ADDRESS || 'missing'
            };
        }
    } catch (error) {
        healthResults.services.smartContract = {
            status: 'unhealthy',
            error: error.message,
            address: process.env.CONTRACT_ADDRESS || 'missing'
        };
    }
    
    // Check IPFS service
    try {
        if (ipfsService) {
            const start = Date.now();
            const ipfsHealth = await ipfsService.healthCheck();
            const responseTime = Date.now() - start;
            
            healthResults.services.ipfs = {
                status: ipfsHealth.healthy ? 'healthy' : 'unhealthy',
                provider: ipfsHealth.provider,
                responseTime,
                ...(ipfsHealth.error && { error: ipfsHealth.error }),
                ...(ipfsHealth.hash && { testHash: ipfsHealth.hash })
            };
        } else {
            healthResults.services.ipfs = {
                status: 'unavailable',
                error: 'Service not initialized'
            };
        }
    } catch (error) {
        healthResults.services.ipfs = {
            status: 'unhealthy',
            error: error.message,
            provider: process.env.IPFS_PROVIDER || 'not_configured'
        };
    }
    
    // Determine overall status
    const serviceStatuses = Object.values(healthResults.services).map(s => s.status);
    const hasUnhealthy = serviceStatuses.includes('unhealthy');
    const hasUnavailable = serviceStatuses.includes('unavailable');
    
    if (hasUnhealthy) {
        healthResults.status = 'unhealthy';
    } else if (hasUnavailable) {
        healthResults.status = 'degraded';
    } else {
        healthResults.status = 'healthy';
    }
    
    // Set appropriate HTTP status code
    const statusCode = healthResults.status === 'healthy' ? 200 :
                      healthResults.status === 'degraded' ? 207 : 503;
    
    res.status(statusCode).json(healthResults);
});

/**
 * GET /api/health/blockchain
 * Blockchain-specific health check
 */
router.get('/blockchain', async (req, res) => {
    try {
        if (!process.env.RPC_URL) {
            return res.status(503).json({
                status: 'unhealthy',
                error: 'RPC_URL not configured'
            });
        }
        
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        const start = Date.now();
        
        const [blockNumber, network, gasPrice] = await Promise.all([
            provider.getBlockNumber(),
            provider.getNetwork(),
            provider.getGasPrice()
        ]);
        
        const responseTime = Date.now() - start;
        
        res.json({
            status: 'healthy',
            network: {
                name: network.name,
                chainId: network.chainId
            },
            currentBlock: blockNumber,
            gasPrice: gasPrice.toString(),
            responseTime,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/health/ipfs
 * IPFS-specific health check
 */
router.get('/ipfs', async (req, res) => {
    try {
        if (!ipfsService) {
            return res.status(503).json({
                status: 'unavailable',
                error: 'IPFS service not initialized'
            });
        }
        
        const healthResult = await ipfsService.healthCheck();
        
        const statusCode = healthResult.healthy ? 200 : 503;
        
        res.status(statusCode).json({
            status: healthResult.healthy ? 'healthy' : 'unhealthy',
            provider: healthResult.provider,
            ...(healthResult.error && { error: healthResult.error }),
            ...(healthResult.hash && { testHash: healthResult.hash }),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/health/contract
 * Smart contract specific health check
 */
router.get('/contract', async (req, res) => {
    try {
        if (!process.env.CONTRACT_ADDRESS) {
            return res.status(503).json({
                status: 'not_configured',
                error: 'CONTRACT_ADDRESS not set'
            });
        }
        
        if (!process.env.RPC_URL) {
            return res.status(503).json({
                status: 'unhealthy',
                error: 'RPC_URL not configured'
            });
        }
        
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        const start = Date.now();
        
        const [code, balance] = await Promise.all([
            provider.getCode(process.env.CONTRACT_ADDRESS),
            provider.getBalance(process.env.CONTRACT_ADDRESS)
        ]);
        
        const responseTime = Date.now() - start;
        
        if (code === '0x') {
            return res.status(503).json({
                status: 'not_deployed',
                error: 'No contract code found at address',
                address: process.env.CONTRACT_ADDRESS
            });
        }
        
        res.json({
            status: 'healthy',
            address: process.env.CONTRACT_ADDRESS,
            codeSize: code.length,
            balance: balance.toString(),
            responseTime,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            address: process.env.CONTRACT_ADDRESS || 'not_configured',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/health/config
 * Configuration health check
 */
router.get('/config', (req, res) => {
    const requiredEnvVars = [
        'RPC_URL',
        'PRIVATE_KEY',
        'CONTRACT_ADDRESS',
        'JWT_SECRET'
    ];
    
    const optionalEnvVars = [
        'PINATA_API_KEY',
        'PINATA_SECRET_KEY',
        'IPFS_PROVIDER',
        'PORT'
    ];
    
    const configStatus = {
        status: 'healthy',
        required: {},
        optional: {},
        timestamp: new Date().toISOString()
    };
    
    let hasErrors = false;
    
    // Check required environment variables
    for (const envVar of requiredEnvVars) {
        const isSet = Boolean(process.env[envVar]);
        configStatus.required[envVar] = {
            configured: isSet,
            length: isSet ? process.env[envVar].length : 0
        };
        
        if (!isSet) {
            hasErrors = true;
        }
    }
    
    // Check optional environment variables
    for (const envVar of optionalEnvVars) {
        const isSet = Boolean(process.env[envVar]);
        configStatus.optional[envVar] = {
            configured: isSet,
            length: isSet ? process.env[envVar].length : 0
        };
    }
    
    configStatus.status = hasErrors ? 'incomplete' : 'healthy';
    
    const statusCode = hasErrors ? 422 : 200;
    res.status(statusCode).json(configStatus);
});

module.exports = router;
const express = require('express');
const DocumentSignatureService = require('../services/DocumentSignatureService');
const IPFSService = require('../services/IPFSService');
const authMiddleware = require('../middleware/auth');
const { validateSignature } = require('../middleware/validation');

const router = express.Router();

// Initialize services
const signatureService = new DocumentSignatureService({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS
});

const ipfsService = new IPFSService({
    provider: process.env.IPFS_PROVIDER || 'pinata',
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretKey: process.env.PINATA_SECRET_KEY
});

/**
 * POST /api/signatures/:documentHash/sign
 * Sign a document
 */
router.post('/:documentHash/sign', 
    authMiddleware,
    validateSignature,
    async (req, res, next) => {
        try {
            const { documentHash } = req.params;
            const { signatureMetadata, signatureData } = req.body;
            const signerAddress = req.user.address;
            
            // Check if user is authorized to sign this document
            const signersResult = await signatureService.getRequiredSigners(documentHash);
            
            if (!signersResult.success) {
                return res.status(404).json({ 
                    error: 'Document not found' 
                });
            }
            
            const isAuthorized = signersResult.signers.some(
                signer => signer.toLowerCase() === signerAddress.toLowerCase()
            );
            
            if (!isAuthorized) {
                return res.status(403).json({ 
                    error: 'Not authorized to sign this document' 
                });
            }
            
            // Check if already signed
            const existingSignature = await signatureService.getSignatureStatus(
                documentHash, 
                signerAddress
            );
            
            if (existingSignature.success && existingSignature.signed) {
                return res.status(409).json({ 
                    error: 'Document already signed by this address',
                    signedAt: existingSignature.timestamp
                });
            }
            
            let ipfsHash = '';
            
            // Upload signature metadata to IPFS if provided
            if (signatureMetadata || signatureData) {
                try {
                    const metadata = {
                        signer: signerAddress,
                        documentHash,
                        timestamp: new Date().toISOString(),
                        ...signatureMetadata,
                        ...(signatureData && { signatureData })
                    };
                    
                    const ipfsResult = await ipfsService.uploadSignatureMetadata(
                        signerAddress,
                        documentHash,
                        metadata
                    );
                    
                    if (ipfsResult.success) {
                        ipfsHash = ipfsResult.hash;
                    }
                } catch (ipfsError) {
                    console.warn('Failed to upload signature metadata to IPFS:', ipfsError);
                    // Continue with signing even if IPFS upload fails
                }
            }
            
            // Sign on blockchain
            const result = await signatureService.signDocument(documentHash, ipfsHash);
            
            if (!result.success) {
                return res.status(500).json({ 
                    error: 'Failed to sign document on blockchain',
                    details: result.error
                });
            }
            
            // Check if document is now fully signed
            const completionStatus = await signatureService.isDocumentFullySigned(documentHash);
            const progress = await signatureService.getSigningProgress(documentHash);
            
            res.json({
                success: true,
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                signer: signerAddress,
                signedAt: result.timestamp,
                ipfsHash: ipfsHash || null,
                isDocumentComplete: completionStatus.success ? completionStatus.isFullySigned : false,
                signingProgress: {
                    signedCount: progress.success ? progress.signedCount : 0,
                    totalSigners: progress.success ? progress.totalSigners : 0,
                    percentComplete: progress.success ? progress.percentComplete : 0
                }
            });
            
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /api/signatures/:documentHash/:signerAddress
 * Get signature details for a specific signer
 */
router.get('/:documentHash/:signerAddress', async (req, res, next) => {
    try {
        const { documentHash, signerAddress } = req.params;
        
        // Validate address format
        if (!signerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            return res.status(400).json({ 
                error: 'Invalid Ethereum address format' 
            });
        }
        
        const result = await signatureService.getSignatureStatus(documentHash, signerAddress);
        
        if (!result.success) {
            return res.status(404).json({ 
                error: 'Signature not found or document does not exist' 
            });
        }
        
        let signatureMetadata = null;
        
        // Get signature metadata from IPFS if available
        if (result.signatureMetadata) {
            try {
                const ipfsResult = await ipfsService.getJSON(result.signatureMetadata);
                if (ipfsResult.success) {
                    signatureMetadata = ipfsResult.data;
                }
            } catch (ipfsError) {
                console.warn('Failed to fetch signature metadata from IPFS:', ipfsError);
            }
        }
        
        res.json({
            documentHash,
            signer: signerAddress,
            signed: result.signed,
            timestamp: result.timestamp,
            signedAt: result.timestamp ? new Date(result.timestamp * 1000).toISOString() : null,
            ipfsHash: result.signatureMetadata || null,
            metadata: signatureMetadata
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/signatures/:documentHash/verify
 * Verify all signatures on a document
 */
router.post('/:documentHash/verify', async (req, res, next) => {
    try {
        const { documentHash } = req.params;
        
        // Get all required signers
        const signersResult = await signatureService.getRequiredSigners(documentHash);
        
        if (!signersResult.success) {
            return res.status(404).json({ 
                error: 'Document not found' 
            });
        }
        
        const verificationResults = [];
        
        // Verify each signature
        for (const signer of signersResult.signers) {
            try {
                const verification = await signatureService.verifySignature(documentHash, signer);
                
                verificationResults.push({
                    signer,
                    isValid: verification.success ? verification.isValid : false,
                    signedAt: verification.success ? verification.signedAt : 0,
                    documentActive: verification.success ? verification.documentActive : false,
                    error: !verification.success ? verification.error : null
                });
            } catch (error) {
                verificationResults.push({
                    signer,
                    isValid: false,
                    signedAt: 0,
                    documentActive: false,
                    error: error.message
                });
            }
        }
        
        const validSignatures = verificationResults.filter(r => r.isValid).length;
        const isFullyValid = validSignatures === signersResult.signers.length;
        
        res.json({
            documentHash,
            isFullyValid,
            validSignatures,
            totalSigners: signersResult.signers.length,
            verificationResults,
            verifiedAt: new Date().toISOString()
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/signatures/:documentHash
 * Get all signatures for a document
 */
router.get('/:documentHash', async (req, res, next) => {
    try {
        const { documentHash } = req.params;
        
        const progress = await signatureService.getSigningProgress(documentHash);
        
        if (!progress.success) {
            return res.status(404).json({ 
                error: 'Document not found' 
            });
        }
        
        // Enrich signatures with IPFS metadata
        const enrichedSignatures = [];
        
        for (const signature of progress.signatures) {
            let metadata = null;
            
            if (signature.signatureMetadata) {
                try {
                    const ipfsResult = await ipfsService.getJSON(signature.signatureMetadata);
                    if (ipfsResult.success) {
                        metadata = ipfsResult.data;
                    }
                } catch (error) {
                    console.warn(`Failed to fetch metadata for ${signature.address}:`, error);
                }
            }
            
            enrichedSignatures.push({
                ...signature,
                signedAt: signature.timestamp ? new Date(signature.timestamp * 1000).toISOString() : null,
                metadata
            });
        }
        
        res.json({
            documentHash,
            totalSigners: progress.totalSigners,
            signedCount: progress.signedCount,
            percentComplete: progress.percentComplete,
            signatures: enrichedSignatures
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/signatures/:documentHash/:signerAddress
 * Revoke a signature (if supported by contract)
 */
router.delete('/:documentHash/:signerAddress', 
    authMiddleware,
    async (req, res, next) => {
        try {
            const { documentHash, signerAddress } = req.params;
            const userAddress = req.user.address;
            
            // Only allow users to revoke their own signatures
            if (userAddress.toLowerCase() !== signerAddress.toLowerCase()) {
                return res.status(403).json({ 
                    error: 'Can only revoke your own signature' 
                });
            }
            
            // This would need to be implemented in the smart contract
            res.status(501).json({ 
                error: 'Signature revocation not implemented',
                message: 'This feature requires smart contract modification to support signature revocation'
            });
            
        } catch (error) {
            next(error);
        }
    }
);

/**
 * POST /api/signatures/:documentHash/notify
 * Send notification to pending signers
 */
router.post('/:documentHash/notify', 
    authMiddleware,
    async (req, res, next) => {
        try {
            const { documentHash } = req.params;
            const { message, method } = req.body; // method: 'email' | 'webhook' | 'push'
            
            // Get signing progress
            const progress = await signatureService.getSigningProgress(documentHash);
            
            if (!progress.success) {
                return res.status(404).json({ 
                    error: 'Document not found' 
                });
            }
            
            // Find pending signers
            const pendingSigners = progress.signatures.filter(sig => !sig.signed);
            
            if (pendingSigners.length === 0) {
                return res.status(400).json({ 
                    error: 'Document is already fully signed' 
                });
            }
            
            // This would integrate with notification service
            res.json({
                message: 'Notification feature not yet implemented',
                pendingSigners: pendingSigners.map(s => s.address),
                suggestedImplementation: {
                    email: 'Integrate with SendGrid, AWS SES, or similar',
                    webhook: 'Send HTTP POST to signer webhook URLs',
                    push: 'Integrate with Firebase Cloud Messaging'
                }
            });
            
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');

class DocumentSignatureService {
    constructor(config) {
        this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        this.wallet = new ethers.Wallet(config.privateKey, this.provider);
        this.contractAddress = config.contractAddress;
        
        // You'll need to include the ABI from your compiled smart contract
        this.contractABI = [
            // Simplified ABI - you'll get the full one when you compile the contract
            "function createDocument(string memory _documentHash, address[] memory _requiredSigners) external",
            "function signDocument(string memory _documentHash, string memory _signatureIpfsHash) external",
            "function isFullySigned(string memory _documentHash) external view returns (bool)",
            "function getSignature(string memory _documentHash, address _signer) external view returns (bool signed, uint256 timestamp, string memory ipfsHash)",
            "function verifyDocumentSignature(string memory _documentHash, address _signer) external view returns (bool isValid, uint256 signedAt, bool documentActive)",
            "function getDocumentSigners(string memory _documentHash) external view returns (address[] memory)",
            "event DocumentCreated(string indexed documentHash, address creator)",
            "event DocumentSigned(string indexed documentHash, address signer)"
        ];
        
        this.contract = new ethers.Contract(
            this.contractAddress,
            this.contractABI,
            this.wallet
        );
    }
    
    /**
     * Generate SHA-256 hash of document content
     */
    hashDocument(documentBuffer) {
        return crypto.createHash('sha256').update(documentBuffer).digest('hex');
    }
    
    /**
     * Create a new document for signing
     */
    async createDocument(documentBuffer, requiredSigners) {
        try {
            const documentHash = this.hashDocument(documentBuffer);
            
            // Validate addresses
            const validatedSigners = requiredSigners.map(addr => 
                ethers.utils.getAddress(addr)
            );
            
            const tx = await this.contract.createDocument(
                documentHash,
                validatedSigners,
                {
                    gasLimit: 300000 // Adjust as needed
                }
            );
            
            const receipt = await tx.wait();
            
            return {
                success: true,
                documentHash,
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Sign a document
     */
    async signDocument(documentHash, signatureMetadata = '') {
        try {
            const tx = await this.contract.signDocument(
                documentHash,
                signatureMetadata,
                {
                    gasLimit: 200000
                }
            );
            
            const receipt = await tx.wait();
            
            return {
                success: true,
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                timestamp: Date.now()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Check if document is fully signed
     */
    async isDocumentFullySigned(documentHash) {
        try {
            const isComplete = await this.contract.isFullySigned(documentHash);
            return {
                success: true,
                isFullySigned: isComplete
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get signature status for a specific signer
     */
    async getSignatureStatus(documentHash, signerAddress) {
        try {
            const [signed, timestamp, ipfsHash] = await this.contract.getSignature(
                documentHash,
                signerAddress
            );
            
            return {
                success: true,
                signed,
                timestamp: timestamp.toNumber(),
                signatureMetadata: ipfsHash
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Verify a document signature
     */
    async verifySignature(documentHash, signerAddress) {
        try {
            const [isValid, signedAt, documentActive] = await this.contract.verifyDocumentSignature(
                documentHash,
                signerAddress
            );
            
            return {
                success: true,
                isValid,
                signedAt: signedAt.toNumber(),
                documentActive
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get all required signers for a document
     */
    async getRequiredSigners(documentHash) {
        try {
            const signers = await this.contract.getDocumentSigners(documentHash);
            return {
                success: true,
                signers
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get document signing progress
     */
    async getSigningProgress(documentHash) {
        try {
            const signersResult = await this.getRequiredSigners(documentHash);
            if (!signersResult.success) {
                return signersResult;
            }
            
            const signers = signersResult.signers;
            const signatures = [];
            
            for (const signer of signers) {
                const status = await this.getSignatureStatus(documentHash, signer);
                signatures.push({
                    address: signer,
                    ...status
                });
            }
            
            const signedCount = signatures.filter(sig => sig.signed).length;
            
            return {
                success: true,
                totalSigners: signers.length,
                signedCount,
                percentComplete: Math.round((signedCount / signers.length) * 100),
                signatures
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Listen for signature events
     */
    listenForSignatureEvents(callback) {
        this.contract.on('DocumentSigned', (documentHash, signer, event) => {
            callback({
                type: 'DocumentSigned',
                documentHash,
                signer,
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        });
        
        this.contract.on('DocumentCreated', (documentHash, creator, event) => {
            callback({
                type: 'DocumentCreated',
                documentHash,
                creator,
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        });
    }
    
    /**
     * Estimate gas costs for operations
     */
    async estimateGasCosts(documentBuffer, requiredSigners) {
        try {
            const documentHash = this.hashDocument(documentBuffer);
            
            const createGas = await this.contract.estimateGas.createDocument(
                documentHash,
                requiredSigners
            );
            
            const signGas = await this.contract.estimateGas.signDocument(
                documentHash,
                ""
            );
            
            const gasPrice = await this.provider.getGasPrice();
            
            return {
                createDocument: {
                    gasLimit: createGas.toString(),
                    estimatedCost: ethers.utils.formatEther(createGas.mul(gasPrice))
                },
                signDocument: {
                    gasLimit: signGas.toString(),
                    estimatedCost: ethers.utils.formatEther(signGas.mul(gasPrice))
                }
            };
        } catch (error) {
            throw new Error(`Gas estimation failed: ${error.message}`);
        }
    }
}

// Example usage
async function example() {
    const config = {
        rpcUrl: 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_API_KEY', // Mumbai testnet
        privateKey: 'YOUR_PRIVATE_KEY',
        contractAddress: 'YOUR_DEPLOYED_CONTRACT_ADDRESS'
    };
    
    const signatureService = new DocumentSignatureService(config);
    
    // Create a document
    const documentBuffer = fs.readFileSync('path/to/document.pdf');
    const requiredSigners = [
        '0x742d35Cc6634C0532925a3b8D4a44956Ad6E7A07', // Alice
        '0x8ba1f109551bD432803012645Hac136c776c09AA'  // Bob
    ];
    
    try {
        // Create document
        console.log('Creating document...');
        const createResult = await signatureService.createDocument(documentBuffer, requiredSigners);
        console.log('Document created:', createResult);
        
        if (createResult.success) {
            // Check signing progress
            const progress = await signatureService.getSigningProgress(createResult.documentHash);
            console.log('Signing progress:', progress);
            
            // Listen for signature events
            signatureService.listenForSignatureEvents((event) => {
                console.log('Signature event:', event);
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

module.exports = DocumentSignatureService;
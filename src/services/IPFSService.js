const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

class IPFSService {
    constructor(config = {}) {
        // Configure IPFS service (Pinata, Infura, or local node)
        this.provider = config.provider || 'pinata'; // 'pinata', 'infura', 'local'
        
        // Pinata configuration
        this.pinataApiKey = config.pinataApiKey || process.env.PINATA_API_KEY;
        this.pinataSecretKey = config.pinataSecretKey || process.env.PINATA_SECRET_KEY;
        this.pinataBaseUrl = 'https://api.pinata.cloud';
        
        // Infura configuration
        this.infuraProjectId = config.infuraProjectId || process.env.INFURA_PROJECT_ID;
        this.infuraProjectSecret = config.infuraProjectSecret || process.env.INFURA_PROJECT_SECRET;
        this.infuraBaseUrl = 'https://ipfs.infura.io:5001/api/v0';
        
        // Local IPFS node configuration
        this.localNodeUrl = config.localNodeUrl || 'http://localhost:5001/api/v0';
        
        // Gateway URLs for retrieving files
        this.gateways = {
            pinata: 'https://gateway.pinata.cloud/ipfs/',
            infura: 'https://ipfs.infura.io/ipfs/',
            cloudflare: 'https://cloudflare-ipfs.com/ipfs/',
            local: 'http://localhost:8080/ipfs/'
        };
    }
    
    /**
     * Upload file to IPFS
     */
    async uploadFile(fileBuffer, filename, metadata = {}) {
        try {
            switch (this.provider) {
                case 'pinata':
                    return await this.uploadToPinata(fileBuffer, filename, metadata);
                case 'infura':
                    return await this.uploadToInfura(fileBuffer, filename, metadata);
                case 'local':
                    return await this.uploadToLocal(fileBuffer, filename, metadata);
                default:
                    throw new Error(`Unsupported IPFS provider: ${this.provider}`);
            }
        } catch (error) {
            console.error('IPFS upload failed:', error.message);
            throw new Error(`Failed to upload to IPFS: ${error.message}`);
        }
    }
    
    /**
     * Upload to Pinata
     */
    async uploadToPinata(fileBuffer, filename, metadata = {}) {
        if (!this.pinataApiKey || !this.pinataSecretKey) {
            throw new Error('Pinata API credentials not configured');
        }
        
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const pinataMetadata = {
            name: filename,
            keyvalues: {
                ...metadata,
                uploadedAt: new Date().toISOString(),
                fileSize: fileBuffer.length
            }
        };
        
        formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
        
        const response = await axios.post(`${this.pinataBaseUrl}/pinning/pinFileToIPFS`, formData, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                'pinata_api_key': this.pinataApiKey,
                'pinata_secret_api_key': this.pinataSecretKey
            }
        });
        
        return {
            success: true,
            hash: response.data.IpfsHash,
            size: response.data.PinSize,
            timestamp: response.data.Timestamp,
            gateway: this.gateways.pinata + response.data.IpfsHash,
            provider: 'pinata'
        };
    }
    
    /**
     * Upload to Infura
     */
    async uploadToInfura(fileBuffer, filename, metadata = {}) {
        if (!this.infuraProjectId || !this.infuraProjectSecret) {
            throw new Error('Infura IPFS credentials not configured');
        }
        
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const auth = Buffer.from(`${this.infuraProjectId}:${this.infuraProjectSecret}`).toString('base64');
        
        const response = await axios.post(`${this.infuraBaseUrl}/add`, formData, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                'Authorization': `Basic ${auth}`
            }
        });
        
        const result = response.data;
        
        return {
            success: true,
            hash: result.Hash,
            size: result.Size,
            gateway: this.gateways.infura + result.Hash,
            provider: 'infura'
        };
    }
    
    /**
     * Upload to local IPFS node
     */
    async uploadToLocal(fileBuffer, filename, metadata = {}) {
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const response = await axios.post(`${this.localNodeUrl}/add`, formData, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
            }
        });
        
        const result = response.data;
        
        return {
            success: true,
            hash: result.Hash,
            size: result.Size,
            gateway: this.gateways.local + result.Hash,
            provider: 'local'
        };
    }
    
    /**
     * Pin existing IPFS hash
     */
    async pinHash(ipfsHash, metadata = {}) {
        try {
            switch (this.provider) {
                case 'pinata':
                    return await this.pinToPinata(ipfsHash, metadata);
                case 'infura':
                    return await this.pinToInfura(ipfsHash);
                default:
                    throw new Error(`Pinning not supported for provider: ${this.provider}`);
            }
        } catch (error) {
            throw new Error(`Failed to pin IPFS hash: ${error.message}`);
        }
    }
    
    /**
     * Pin to Pinata by hash
     */
    async pinToPinata(ipfsHash, metadata = {}) {
        const data = {
            hashToPin: ipfsHash,
            pinataMetadata: {
                name: metadata.name || `pinned-${ipfsHash}`,
                keyvalues: metadata
            }
        };
        
        const response = await axios.post(`${this.pinataBaseUrl}/pinning/pinByHash`, data, {
            headers: {
                'Content-Type': 'application/json',
                'pinata_api_key': this.pinataApiKey,
                'pinata_secret_api_key': this.pinataSecretKey
            }
        });
        
        return {
            success: true,
            hash: response.data.ipfsHash,
            status: response.data.status
        };
    }
    
    /**
     * Get file from IPFS
     */
    async getFile(ipfsHash, gateway = null) {
        const gatewayUrl = gateway || this.gateways.cloudflare;
        const url = gatewayUrl + ipfsHash;
        
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            
            return {
                success: true,
                data: Buffer.from(response.data),
                contentType: response.headers['content-type'],
                size: response.data.byteLength
            };
        } catch (error) {
            // Try fallback gateways
            const fallbacks = [
                this.gateways.pinata,
                this.gateways.infura,
                'https://ipfs.io/ipfs/'
            ];
            
            for (const fallbackGateway of fallbacks) {
                try {
                    const fallbackUrl = fallbackGateway + ipfsHash;
                    const response = await axios.get(fallbackUrl, {
                        responseType: 'arraybuffer',
                        timeout: 15000
                    });
                    
                    return {
                        success: true,
                        data: Buffer.from(response.data),
                        contentType: response.headers['content-type'],
                        size: response.data.byteLength,
                        gateway: fallbackGateway
                    };
                } catch (fallbackError) {
                    continue;
                }
            }
            
            throw new Error(`Failed to retrieve file from IPFS: ${error.message}`);
        }
    }
    
    /**
     * Upload JSON data to IPFS
     */
    async uploadJSON(jsonData, filename = null) {
        const jsonString = JSON.stringify(jsonData, null, 2);
        const buffer = Buffer.from(jsonString, 'utf8');
        const name = filename || `data-${crypto.randomBytes(8).toString('hex')}.json`;
        
        return await this.uploadFile(buffer, name, {
            type: 'application/json',
            dataType: 'json'
        });
    }
    
    /**
     * Get JSON data from IPFS
     */
    async getJSON(ipfsHash) {
        try {
            const result = await this.getFile(ipfsHash);
            
            if (!result.success) {
                return result;
            }
            
            const jsonString = result.data.toString('utf8');
            const jsonData = JSON.parse(jsonString);
            
            return {
                success: true,
                data: jsonData
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to parse JSON from IPFS: ${error.message}`
            };
        }
    }
    
    /**
     * Create signature metadata for IPFS storage
     */
    createSignatureMetadata(signerAddress, documentHash, signatureData = {}) {
        return {
            signer: signerAddress,
            documentHash,
            timestamp: new Date().toISOString(),
            signature: signatureData,
            version: '1.0'
        };
    }
    
    /**
     * Upload signature metadata
     */
    async uploadSignatureMetadata(signerAddress, documentHash, signatureData = {}) {
        const metadata = this.createSignatureMetadata(signerAddress, documentHash, signatureData);
        return await this.uploadJSON(metadata, `signature-${signerAddress.slice(0, 8)}.json`);
    }
    
    /**
     * Check IPFS service health
     */
    async healthCheck() {
        try {
            const testData = { test: true, timestamp: Date.now() };
            const buffer = Buffer.from(JSON.stringify(testData));
            
            const uploadResult = await this.uploadFile(buffer, 'health-check.json', {
                temporary: true
            });
            
            if (uploadResult.success) {
                // Try to retrieve the file
                const retrieveResult = await this.getFile(uploadResult.hash);
                
                return {
                    healthy: retrieveResult.success,
                    provider: this.provider,
                    uploadTime: Date.now(),
                    hash: uploadResult.hash
                };
            }
            
            return {
                healthy: false,
                provider: this.provider,
                error: 'Upload failed'
            };
        } catch (error) {
            return {
                healthy: false,
                provider: this.provider,
                error: error.message
            };
        }
    }
}

module.exports = IPFSService;
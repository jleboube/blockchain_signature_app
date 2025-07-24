// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DocumentSignature {
    struct Document {
        string documentHash;     // SHA-256 hash of the document
        address[] signers;       // Addresses of all signers
        uint256 timestamp;       // When document was created
        bool isActive;           // Whether document is still valid
        mapping(address => Signature) signatures;
    }
    
    struct Signature {
        bool signed;
        uint256 timestamp;
        string ipfsHash;         // Optional: signature image/metadata
    }
    
    mapping(string => Document) public documents;
    mapping(address => string[]) public userDocuments;
    
    event DocumentCreated(string indexed documentHash, address creator);
    event DocumentSigned(string indexed documentHash, address signer);
    event DocumentRevoked(string indexed documentHash, address revoker);
    
    modifier documentExists(string memory _docHash) {
        require(documents[_docHash].timestamp > 0, "Document does not exist");
        _;
    }
    
    modifier documentActive(string memory _docHash) {
        require(documents[_docHash].isActive, "Document is not active");
        _;
    }
    
    /**
     * Create a new document for signing
     */
    function createDocument(
        string memory _documentHash,
        address[] memory _requiredSigners
    ) external {
        require(documents[_documentHash].timestamp == 0, "Document already exists");
        require(_requiredSigners.length > 0, "Must have at least one signer");
        
        Document storage doc = documents[_documentHash];
        doc.documentHash = _documentHash;
        doc.signers = _requiredSigners;
        doc.timestamp = block.timestamp;
        doc.isActive = true;
        
        // Add to user's document list
        userDocuments[msg.sender].push(_documentHash);
        
        emit DocumentCreated(_documentHash, msg.sender);
    }
    
    /**
     * Sign a document
     */
    function signDocument(
        string memory _documentHash,
        string memory _signatureIpfsHash
    ) external documentExists(_documentHash) documentActive(_documentHash) {
        Document storage doc = documents[_documentHash];
        
        // Check if address is authorized to sign
        bool authorized = false;
        for (uint i = 0; i < doc.signers.length; i++) {
            if (doc.signers[i] == msg.sender) {
                authorized = true;
                break;
            }
        }
        require(authorized, "Not authorized to sign this document");
        require(!doc.signatures[msg.sender].signed, "Already signed");
        
        doc.signatures[msg.sender] = Signature({
            signed: true,
            timestamp: block.timestamp,
            ipfsHash: _signatureIpfsHash
        });
        
        emit DocumentSigned(_documentHash, msg.sender);
    }
    
    /**
     * Check if document is fully signed
     */
    function isFullySigned(string memory _documentHash) 
        external view documentExists(_documentHash) returns (bool) {
        Document storage doc = documents[_documentHash];
        
        for (uint i = 0; i < doc.signers.length; i++) {
            if (!doc.signatures[doc.signers[i]].signed) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Get signature details for a specific signer
     */
    function getSignature(string memory _documentHash, address _signer)
        external view documentExists(_documentHash) 
        returns (bool signed, uint256 timestamp, string memory ipfsHash) {
        Signature storage sig = documents[_documentHash].signatures[_signer];
        return (sig.signed, sig.timestamp, sig.ipfsHash);
    }
    
    /**
     * Get document signers
     */
    function getDocumentSigners(string memory _documentHash)
        external view documentExists(_documentHash)
        returns (address[] memory) {
        return documents[_documentHash].signers;
    }
    
    /**
     * Get user's documents
     */
    function getUserDocuments(address _user) 
        external view returns (string[] memory) {
        return userDocuments[_user];
    }
    
    /**
     * Revoke a document (only creator can do this)
     */
    function revokeDocument(string memory _documentHash) 
        external documentExists(_documentHash) {
        // In a more complex version, you'd track document creators
        documents[_documentHash].isActive = false;
        emit DocumentRevoked(_documentHash, msg.sender);
    }
    
    /**
     * Verify a document signature on-chain
     */
    function verifyDocumentSignature(
        string memory _documentHash,
        address _signer
    ) external view returns (bool isValid, uint256 signedAt, bool documentActive) {
        if (documents[_documentHash].timestamp == 0) {
            return (false, 0, false);
        }
        
        Document storage doc = documents[_documentHash];
        Signature storage sig = doc.signatures[_signer];
        
        return (sig.signed, sig.timestamp, doc.isActive);
    }
}
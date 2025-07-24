// README.md

# Document Signature via Blockchain Applicaiton

blockchain-document-signatures/
├── contracts/
│   ├── DocumentSignature.sol              # Your smart contract
│   └── Migrations.sol                      # Hardhat deployment helper
├── scripts/
│   ├── deploy.js                          # Contract deployment script
│   └── verify.js                          # Contract verification script
├── src/
│   ├── services/
│   │   ├── DocumentSignatureService.js    # Blockchain integration service
│   │   ├── IPFSService.js                 # File storage service (future)
│   │   └── AuthService.js                 # Authentication service (future)
│   ├── routes/
│   │   ├── documents.js                   # Document-related API routes
│   │   ├── signatures.js                  # Signature-related API routes
│   │   └── health.js                      # Health check routes
│   ├── middleware/
│   │   ├── auth.js                        # Authentication middleware
│   │   ├── validation.js                  # Input validation middleware
│   │   └── errorHandler.js                # Error handling middleware
│   ├── utils/
│   │   ├── blockchain.js                  # Blockchain utility functions
│   │   ├── crypto.js                      # Cryptographic utilities
│   │   └── constants.js                   # Application constants
│   └── app.js                             # Main Express application
├── frontend/                              # Your web frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── public/
│   └── package.json
├── test/
│   ├── contracts/
│   │   └── DocumentSignature.test.js      # Smart contract tests
│   ├── services/
│   │   └── DocumentSignatureService.test.js # Service tests
│   └── integration/
│       └── api.test.js                    # API integration tests
├── hardhat.config.js                      # Hardhat configuration
├── package.json                           # Node.js dependencies
├── .env.example                           # Environment variables template
├── .gitignore
└── README.md







# Blockchain Document Signatures

A comprehensive blockchain-based document signature validation system that provides immutable, transparent, and decentralized signature verification.

## 🚀 Features

- **Blockchain-Based**: Immutable signature records on Ethereum/Polygon
- **Multi-Network Support**: Ethereum, Polygon, Arbitrum, Optimism, BSC, Avalanche
- **IPFS Storage**: Decentralized document storage
- **Real-time Updates**: WebSocket notifications for signature events
- **REST API**: Complete API for document and signature management
- **Gas Optimization**: Efficient smart contracts with low transaction costs
- **Security**: JWT authentication, input validation, rate limiting
- **Multi-Signer Support**: Complex approval workflows with multiple signers

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Blockchain    │
│                 │◄──►│                 │◄──►│                 │
│  - Web App      │    │  - Express.js   │    │  - Smart        │
│  - Mobile App   │    │  - Socket.io    │    │    Contract     │
│  - Desktop App  │    │  - Auth Layer   │    │  - Events       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   IPFS Storage  │
                       │                 │
                       │  - Documents    │
                       │  - Metadata     │
                       │  - Signatures   │
                       └─────────────────┘
```

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **npm** (v8 or higher)
- **Git**
- A blockchain wallet with testnet tokens
- API keys for blockchain services (Alchemy/Infura)
- IPFS service account (Pinata recommended)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/blockchain-document-signatures.git
cd blockchain-document-signatures
npm install
```

### 2. Environment Setup

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 3. Essential Environment Variables

```bash
# Blockchain (Mumbai testnet recommended for development)
RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
NETWORK_NAME=mumbai

# Application
NODE_ENV=development
PORT=3000
JWT_SECRET=your_super_secret_jwt_key

# IPFS
IPFS_PROVIDER=pinata
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
```

### 4. Get Testnet Tokens

For Mumbai (Polygon testnet):
- Visit [Polygon Faucet](https://faucet.polygon.technology/)
- Enter your wallet address
- Request test MATIC tokens

### 5. Deploy Smart Contract

```bash
# Compile contracts
npm run compile

# Deploy to Mumbai testnet
npm run deploy:mumbai

# Copy the contract address to your .env file
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

### 6. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

Your API will be available at `http://localhost:3000`

## 📚 API Documentation

### Authentication

All protected endpoints require a JWT token:

```bash
Authorization: Bearer <your_jwt_token>
```

### Document Management

#### Create Document
```bash
POST /api/documents
Content-Type: multipart/form-data

# Form data:
# - document: file upload
# - signers: ["0xAddress1", "0xAddress2"]
# - title: "Document Title"
# - description: "Document Description"
```

#### Get Document Status
```bash
GET /api/documents/{documentHash}
```

#### Download Document
```bash
GET /api/documents/{documentHash}/download?ipfsHash={hash}
```

### Signature Management

#### Sign Document
```bash
POST /api/signatures/{documentHash}/sign
{
  "signatureMetadata": {
    "reason": "I approve this document",
    "location": "New York, NY"
  }
}
```

#### Get Signatures
```bash
GET /api/signatures/{documentHash}
```

#### Verify Signatures
```bash
POST /api/signatures/{documentHash}/verify
```

### Health Checks

```bash
GET /api/health              # Basic health
GET /api/health/detailed     # Comprehensive check
GET /api/health/blockchain   # Blockchain connectivity
GET /api/health/ipfs         # IPFS service
```

## 🔧 Development

### Running Tests

```bash
# All tests
npm test

# Contract tests only
npm run test:contracts

# Service tests only
npm run test:services

# Integration tests only
npm run test:integration

# Test coverage
npm run test:coverage
```

### Development Tools

```bash
# Start local blockchain
npm run node

# Deploy to local network
npm run deploy:localhost

# Contract size analysis
npm run size

# Gas usage reporting
npm run gas-report

# Code linting
npm run lint
npm run lint:fix

# Code formatting
npm run prettier
```

### Smart Contract Development

```bash
# Compile contracts
npm run compile

# Clean artifacts
npm run clean

# Generate documentation
npm run docs:generate

# Security analysis
npm run analyze
```

## 🌐 Network Configuration

### Recommended Networks

| Network | Use Case | Cost | Speed |
|---------|----------|------|-------|
| **Polygon Mumbai** | Development | Free | Fast |
| **Polygon Mainnet** | Production | Very Low | Fast |
| **Ethereum Sepolia** | Testing | Free | Medium |
| **Arbitrum** | Production Alt | Low | Fast |

### Gas Cost Estimates

| Operation | Polygon | Ethereum | Arbitrum |
|-----------|---------|----------|----------|
| Deploy Contract | ~$0.01 | ~$50 | ~$5 |
| Create Document | ~$0.001 | ~$10 | ~$1 |
| Sign Document | ~$0.0005 | ~$5 | ~$0.50 |

## 🔒 Security

### Best Practices

1. **Never commit private keys** - Use environment variables
2. **Use dedicated wallets** - Don't use your main wallet for the app
3. **Regular audits** - Review dependencies and smart contracts
4. **Input validation** - All user inputs are validated
5. **Rate limiting** - API endpoints are rate limited
6. **HTTPS only** - Use HTTPS in production

### Security Features

- JWT authentication with expiration
- Address validation and normalization
- File type and size validation
- Request rate limiting
- CORS protection
- Helmet security headers
- Input sanitization

## 📊 Monitoring

### Health Endpoints

The application provides comprehensive health checks:

- `/api/health` - Basic server status
- `/api/health/detailed` - Full system check
- `/api/health/blockchain` - RPC connectivity
- `/api/health/contract` - Smart contract status
- `/api/health/ipfs` - File storage status

### WebSocket Events

Real-time updates via WebSocket:

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3000');

// Subscribe to document updates
socket.emit('subscribe', { 
  documentHash: 'your_document_hash' 
});

// Listen for signature events
socket.on('blockchain:event', (event) => {
  console.log('New signature:', event);
});
```

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use mainnet RPC URL
- [ ] Deploy contract to mainnet
- [ ] Set strong JWT secret
- [ ] Configure CORS properly
- [ ] Set up SSL/HTTPS
- [ ] Configure monitoring
- [ ] Set up backups
- [ ] Test all endpoints

### Docker Deployment

```bash
# Build Docker image
docker build -t document-signatures .

# Run container
docker run -p 3000:3000 --env-file .env document-signatures
```

### Environment-Specific Configuration

#### Development
```bash
NODE_ENV=development
RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/API_KEY
```

#### Staging
```bash
NODE_ENV=staging
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/API_KEY
```

#### Production
```bash
NODE_ENV=production
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/API_KEY
CORS_ORIGIN=https://yourdomain.com
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation
- Ensure all tests pass
- Follow security best practices

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

#### "Contract deployment failed"
- Check you have testnet tokens
- Verify RPC URL is correct
- Ensure private key format is correct

#### "IPFS upload failed"
- Verify Pinata API keys
- Check file size limits
- Ensure internet connectivity

#### "Authentication failed"
- Check JWT secret configuration
- Verify token expiration
- Ensure correct Authorization header

#### "Gas estimation failed"
- Check network connectivity
- Verify contract address
- Ensure wallet has enough tokens

### Getting Help

1. Check the [Issues](https://github.com/yourusername/blockchain-document-signatures/issues) page
2. Review the API documentation
3. Join our [Discord](https://discord.gg/your-server) community
4. Email support: support@yourdomain.com

## 🔗 Resources

- [Ethereum Documentation](https://ethereum.org/developers/)
- [Polygon Documentation](https://docs.polygon.technology/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [IPFS Documentation](https://docs.ipfs.io/)
- [Express.js Documentation](https://expressjs.com/)

## 🏆 Acknowledgments

- OpenZeppelin for secure smart contract libraries
- Hardhat team for excellent development tools
- Polygon for scalable blockchain infrastructure
- IPFS for decentralized storage solutions

---

**Built with ❤️ for the decentralized future**
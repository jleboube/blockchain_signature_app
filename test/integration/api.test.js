const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');

// Mock environment variables before requiring the app
process.env.NODE_ENV = 'test';
process.env.RPC_URL = 'http://localhost:8545';
process.env.PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
process.env.JWT_SECRET = 'test-jwt-secret';

const app = require('../../src/app');

describe('API Integration Tests', function () {
    let authToken;
    let documentHash;
    let samplePdfBuffer;

    const SAMPLE_ADDRESS = '0x742d35Cc6634C0532925a3b8D4a44956Ad6E7A07';
    const SAMPLE_SIGNERS = [
        '0x742d35Cc6634C0532925a3b8D4a44956Ad6E7A07',
        '0x8ba1f109551bD432803012645Hac136c776c09AA'
    ];

    before(function () {
        // Create a sample PDF buffer for testing
        samplePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000079 00000 n \n0000000173 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n253\n%%EOF');
        
        // Generate a mock JWT token for testing
        const jwt = require('jsonwebtoken');
        authToken = jwt.sign(
            { address: SAMPLE_ADDRESS, type: 'wallet_auth' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    });

    describe('Health Check Endpoints', function () {
        describe('GET /api/health', function () {
            it('should return basic health status', async function () {
                const response = await request(app)
                    .get('/api/health')
                    .expect(200);

                expect(response.body).to.have.property('status', 'healthy');
                expect(response.body).to.have.property('timestamp');
                expect(response.body).to.have.property('uptime');
            });
        });

        describe('GET /api/health/config', function () {
            it('should return configuration status', async function () {
                const response = await request(app)
                    .get('/api/health/config')
                    .expect(200);

                expect(response.body).to.have.property('status');
                expect(response.body).to.have.property('required');
                expect(response.body).to.have.property('optional');
                expect(response.body.required).to.have.property('RPC_URL');
                expect(response.body.required).to.have.property('PRIVATE_KEY');
            });
        });
    });

    describe('Document Management', function () {
        describe('POST /api/documents', function () {
            it('should create a new document with authentication', async function () {
                const response = await request(app)
                    .post('/api/documents')
                    .set('Authorization', `Bearer ${authToken}`)
                    .attach('document', samplePdfBuffer, 'test-document.pdf')
                    .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                    .field('title', 'Test Document')
                    .field('description', 'A test document for integration testing')
                    .expect(201);

                expect(response.body).to.have.property('documentHash');
                expect(response.body).to.have.property('fileName', 'test-document.pdf');
                expect(response.body).to.have.property('requiredSigners');
                expect(response.body.requiredSigners).to.deep.equal(SAMPLE_SIGNERS);
                
                // Store document hash for later tests
                documentHash = response.body.documentHash;
            });

            it('should fail without authentication', async function () {
                const response = await request(app)
                    .post('/api/documents')
                    .attach('document', samplePdfBuffer, 'test-document.pdf')
                    .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                    .expect(401);

                expect(response.body).to.have.property('error');
            });

            it('should fail without document file', async function () {
                const response = await request(app)
                    .post('/api/documents')
                    .set('Authorization', `Bearer ${authToken}`)
                    .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                    .expect(400);

                expect(response.body).to.have.property('error');
            });

            it('should fail with invalid signers', async function () {
                const response = await request(app)
                    .post('/api/documents')
                    .set('Authorization', `Bearer ${authToken}`)
                    .attach('document', samplePdfBuffer, 'test-document.pdf')
                    .field('signers', JSON.stringify(['invalid-address']))
                    .expect(400);

                expect(response.body).to.have.property('error');
                expect(response.body.errors).to.be.an('array');
            });

            it('should fail with unsupported file type', async function () {
                const response = await request(app)
                    .post('/api/documents')
                    .set('Authorization', `Bearer ${authToken}`)
                    .attach('document', Buffer.from('test content'), 'test.exe')
                    .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                    .expect(400);

                expect(response.body).to.have.property('error');
            });
        });

        describe('GET /api/documents/:documentHash', function () {
            it('should get document status', async function () {
                // Skip if documentHash is not available from previous test
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .get(`/api/documents/${documentHash}`)
                    .expect(200);

                expect(response.body).to.have.property('documentHash', documentHash);
                expect(response.body).to.have.property('signers');
                expect(response.body).to.have.property('totalSigners');
                expect(response.body).to.have.property('signedCount');
                expect(response.body).to.have.property('percentComplete');
                expect(response.body).to.have.property('isComplete');
            });

            it('should return 404 for non-existent document', async function () {
                const fakeHash = 'a'.repeat(64);
                const response = await request(app)
                    .get(`/api/documents/${fakeHash}`)
                    .expect(404);

                expect(response.body).to.have.property('error');
            });

            it('should return 400 for invalid hash format', async function () {
                const response = await request(app)
                    .get('/api/documents/invalid-hash')
                    .expect(400);

                expect(response.body).to.have.property('error');
            });
        });

        describe('GET /api/documents/:documentHash/signers', function () {
            it('should get required signers', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .get(`/api/documents/${documentHash}/signers`)
                    .expect(200);

                expect(response.body).to.have.property('documentHash', documentHash);
                expect(response.body).to.have.property('signers');
                expect(response.body.signers).to.be.an('array');
                expect(response.body).to.have.property('count');
            });
        });

        describe('POST /api/documents/estimate-cost', function () {
            it('should estimate gas costs', async function () {
                const response = await request(app)
                    .post('/api/documents/estimate-cost')
                    .attach('document', samplePdfBuffer, 'test-document.pdf')
                    .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                    .expect(200);

                expect(response.body).to.have.property('estimates');
                expect(response.body.estimates).to.have.property('createDocument');
                expect(response.body.estimates).to.have.property('signDocument');
                expect(response.body).to.have.property('currency');
                expect(response.body).to.have.property('signersCount');
            });
        });
    });

    describe('Signature Management', function () {
        describe('POST /api/signatures/:documentHash/sign', function () {
            it('should sign a document with authentication', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .post(`/api/signatures/${documentHash}/sign`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        signatureMetadata: {
                            reason: 'I approve this document',
                            location: 'Test Location'
                        }
                    })
                    .expect(200);

                expect(response.body).to.have.property('success', true);
                expect(response.body).to.have.property('signer', SAMPLE_ADDRESS);
                expect(response.body).to.have.property('signedAt');
                expect(response.body).to.have.property('signingProgress');
            });

            it('should fail without authentication', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .post(`/api/signatures/${documentHash}/sign`)
                    .send({
                        signatureMetadata: {
                            reason: 'I approve this document'
                        }
                    })
                    .expect(401);

                expect(response.body).to.have.property('error');
            });

            it('should fail for non-existent document', async function () {
                const fakeHash = 'b'.repeat(64);
                const response = await request(app)
                    .post(`/api/signatures/${fakeHash}/sign`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({})
                    .expect(404);

                expect(response.body).to.have.property('error');
            });

            it('should fail for duplicate signature', async function () {
                if (!documentHash) {
                    this.skip();
                }

                // Try to sign the same document twice
                const response = await request(app)
                    .post(`/api/signatures/${documentHash}/sign`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({})
                    .expect(409);

                expect(response.body).to.have.property('error');
            });
        });

        describe('GET /api/signatures/:documentHash/:signerAddress', function () {
            it('should get signature details', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .get(`/api/signatures/${documentHash}/${SAMPLE_ADDRESS}`)
                    .expect(200);

                expect(response.body).to.have.property('documentHash', documentHash);
                expect(response.body).to.have.property('signer', SAMPLE_ADDRESS);
                expect(response.body).to.have.property('signed');
                expect(response.body).to.have.property('timestamp');
            });

            it('should return 400 for invalid address format', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .get(`/api/signatures/${documentHash}/invalid-address`)
                    .expect(400);

                expect(response.body).to.have.property('error');
            });
        });

        describe('GET /api/signatures/:documentHash', function () {
            it('should get all signatures for a document', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .get(`/api/signatures/${documentHash}`)
                    .expect(200);

                expect(response.body).to.have.property('documentHash', documentHash);
                expect(response.body).to.have.property('totalSigners');
                expect(response.body).to.have.property('signedCount');
                expect(response.body).to.have.property('percentComplete');
                expect(response.body).to.have.property('signatures');
                expect(response.body.signatures).to.be.an('array');
            });
        });

        describe('POST /api/signatures/:documentHash/verify', function () {
            it('should verify all signatures on a document', async function () {
                if (!documentHash) {
                    this.skip();
                }

                const response = await request(app)
                    .post(`/api/signatures/${documentHash}/verify`)
                    .expect(200);

                expect(response.body).to.have.property('documentHash', documentHash);
                expect(response.body).to.have.property('isFullyValid');
                expect(response.body).to.have.property('validSignatures');
                expect(response.body).to.have.property('totalSigners');
                expect(response.body).to.have.property('verificationResults');
                expect(response.body.verificationResults).to.be.an('array');
            });
        });
    });

    describe('Error Handling', function () {
        it('should handle 404 for non-existent endpoints', async function () {
            const response = await request(app)
                .get('/api/non-existent-endpoint')
                .expect(404);

            expect(response.body).to.have.property('error');
        });

        it('should handle malformed JSON', async function () {
            const response = await request(app)
                .post('/api/signatures/test/sign')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body).to.have.property('error');
        });

        it('should handle invalid JWT tokens', async function () {
            const response = await request(app)
                .post('/api/documents')
                .set('Authorization', 'Bearer invalid-token')
                .attach('document', samplePdfBuffer, 'test.pdf')
                .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                .expect(401);

            expect(response.body).to.have.property('error');
        });

        it('should handle missing authorization header', async function () {
            const response = await request(app)
                .post('/api/documents')
                .attach('document', samplePdfBuffer, 'test.pdf')
                .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                .expect(401);

            expect(response.body).to.have.property('error');
        });
    });

    describe('Validation', function () {
        it('should validate document hash format in URLs', async function () {
            const response = await request(app)
                .get('/api/documents/invalid-hash-format')
                .expect(400);

            expect(response.body).to.have.property('error');
        });

        it('should validate file size limits', async function () {
            // Create a buffer larger than the limit (50MB)
            const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
            
            const response = await request(app)
                .post('/api/documents')
                .set('Authorization', `Bearer ${authToken}`)
                .attach('document', largeBuffer, 'large-file.pdf')
                .field('signers', JSON.stringify(SAMPLE_SIGNERS))
                .expect(413);

            expect(response.body).to.have.property('error');
        });

        it('should validate required fields', async function () {
            const response = await request(app)
                .post('/api/documents')
                .set('Authorization', `Bearer ${authToken}`)
                .attach('document', samplePdfBuffer, 'test.pdf')
                // Missing signers field
                .expect(400);

            expect(response.body).to.have.property('error');
        });

        it('should validate signature metadata size', async function () {
            if (!documentHash) {
                this.skip();
            }

            // Create large metadata object (>10KB)
            const largeMetadata = {
                reason: 'A'.repeat(11 * 1024) // 11KB string
            };

            const response = await request(app)
                .post(`/api/signatures/${documentHash}/sign`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    signatureMetadata: largeMetadata
                })
                .expect(400);

            expect(response.body).to.have.property('error');
        });
    });

    describe('CORS and Security Headers', function () {
        it('should include CORS headers', async function () {
            const response = await request(app)
                .options('/api/health')
                .expect(204);

            expect(response.headers).to.have.property('access-control-allow-origin');
        });

        it('should include security headers', async function () {
            const response = await request(app)
                .get('/api/health')
                .expect(200);

            // Check for common security headers
            expect(response.headers).to.have.property('x-content-type-options', 'nosniff');
        });
    });

    describe('Rate Limiting', function () {
        it('should apply rate limiting headers', async function () {
            const response = await request(app)
                .get('/api/health')
                .expect(200);

            // Rate limiting headers should be present if enabled
            if (response.headers['x-ratelimit-limit']) {
                expect(response.headers).to.have.property('x-ratelimit-remaining');
                expect(response.headers).to.have.property('x-ratelimit-reset');
            }
        });
    });

    describe('Content Type Validation', function () {
        it('should accept valid content types', async function () {
            const response = await request(app)
                .post(`/api/signatures/${documentHash || 'test'}/sign`)
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send({})
                // May fail for other reasons, but not content type
                .expect((res) => {
                    expect(res.status).to.not.equal(415); // Unsupported Media Type
                });
        });

        it('should reject invalid content types for JSON endpoints', async function () {
            const response = await request(app)
                .post(`/api/signatures/${documentHash || 'test'}/sign`)
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'text/plain')
                .send('plain text data')
                .expect(400); // Bad request due to invalid content type handling

            expect(response.body).to.have.property('error');
        });
    });
});
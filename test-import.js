/**
 * Test script for import routes
 * This script can be used to test the import API endpoints
 */

const fs = require('fs');
const path = require('path');

// Test data for import
const testData = {
  type: 'stepwise-session',
  version: '1.0.0',
  exportedAt: new Date().toISOString(),
  session: {
    metadata: {
      title: 'Test Import Guide',
      description: 'A test guide for import functionality',
      tags: ['test', 'import'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    steps: [
      {
        id: 'step-1',
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
        type: 'navigate',
        action: {
          type: 'navigate',
          data: {
            url: 'https://example.com',
            description: 'Navigate to example.com'
          }
        },
        screenshot: {
          data: '', // Base64 image data would go here
          format: 'png',
          dimensions: { width: 1920, height: 1080 },
          size: 0
        }
      },
      {
        id: 'step-2',
        sequenceNumber: 1,
        timestamp: new Date().toISOString(),
        type: 'click',
        action: {
          type: 'click',
          target: '#example-button',
          data: {
            description: 'Click on example button'
          }
        }
      }
    ]
  }
};

// Write test file
const testFilePath = path.join(__dirname, 'test-import.stepwise');
fs.writeFileSync(testFilePath, JSON.stringify(testData, null, 2));

console.log(`Test file created at: ${testFilePath}`);
console.log('\nYou can now test the import API using curl:');
console.log('\n1. Import a file:');
console.log(`curl -X POST http://localhost:3000/import \\
  -F "file=@${testFilePath}" \\
  -F "format=stepwise"`);

console.log('\n2. Check import status (replace ID with actual operation ID):');
console.log('curl http://localhost:3000/import/jobs/{operationId}');

console.log('\n3. Get import result:');
console.log('curl http://localhost:3000/import/jobs/{operationId}/result');

console.log('\n4. List all import jobs:');
console.log('curl http://localhost:3000/import/jobs');

console.log('\n5. Get supported formats:');
console.log('curl http://localhost:3000/import/formats');

console.log('\n6. Cancel an import:');
console.log('curl -X DELETE http://localhost:3000/import/jobs/{operationId}');

console.log('\n\nAlso check the Swagger UI at: http://localhost:3000/swagger');
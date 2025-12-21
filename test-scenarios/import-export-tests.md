# Import/Export Functionality Tests

## Test Suite Overview

**Objective**: Verify that import/export functionality works correctly and that file operations don't interfere with WebSocket stability or browser automation.

**Root Cause Hypothesis**: Import/export operations might cause WebSocket instability if file operations fail or consume excessive resources during browser automation.

## Test Scenarios

### 6.1 Export Functionality Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Export operations complete successfully without affecting browser automation

```typescript
// Test Scenarios:
A) PDF Export:
   1. Create session with sample steps
   2. Initiate PDF export via API
   3. Verify export generates correctly
   4. Download and validate PDF content
   5. Verify PDF includes all steps and screenshots
   6. Test WebSocket stability during export

B) DOCX Export:
   1. Create session with sample steps
   2. Initiate DOCX export
   3. Verify export generates correctly
   4. Download and validate DOCX content
   5. Verify formatting and images included
   6. Test WebSocket stability during export

C) Markdown Export:
   1. Create session with sample steps
   2. Initiate Markdown export
   3. Verify export generates correctly
   4. Download and validate Markdown content
   5. Verify image references work
   6. Test WebSocket stability during export

D) ZIP Export:
   1. Create session with sample steps
   2. Initiate ZIP export (HTML + images)
   3. Verify ZIP contains all files
   4. Validate HTML content and structure
   5. Verify image paths are correct
   6. Test WebSocket stability during export

// Expected Results:
- All export formats generate successfully
- Content includes all steps and metadata
- Images properly embedded or referenced
- No WebSocket interruptions during export
- Downloads complete within 30 seconds
```

### 6.2 Export with Encryption Test
**Priority**: Medium  
**Duration**: 4-5 minutes  
**Expected Behavior**: Password-protected exports work correctly

```typescript
// Test Steps:
1. Create session with sample steps
2. Initiate export with password protection
3. Verify encrypted file generated
4. Attempt to download without password (should fail)
5. Download with correct password
6. Verify content decrypted correctly
7. Test different password strengths
8. Verify encryption uses AES-256-GCM

// Expected Results:
- Encryption applied correctly
- Files protected by password
- Decryption works with correct password
- Invalid passwords rejected
- No WebSocket issues during encryption
```

### 6.3 Import Functionality Test
**Priority**: High  
**Duration**: 6-7 minutes  
**Expected Behavior**: Import operations restore sessions correctly

```typescript
// Test Scenarios:
A) Basic Import:
   1. Export session to .stepwise format
   2. Create new session
   3. Import .stepwise file
   4. Verify all steps imported correctly
   5. Verify screenshots restored
   6. Test browser automation after import

B) Import with Password:
   1. Export session with password
   2. Create new session
   3. Import encrypted .stepwise file with password
   4. Verify successful decryption and import
   5. Test invalid password handling

C) Import Validation:
   1. Attempt to import invalid file
   2. Attempt to import corrupted file
   3. Attempt to import wrong format
   4. Verify proper error handling
   5. Test file size limits

D) Import Progress:
   1. Import large .stepwise file
   2. Monitor import progress
   3. Verify progress updates
   4. Test cancellation during import
   5. Verify cleanup on failure

// Expected Results:
- All step data imported correctly
- Screenshots restored properly
- Browser automation works after import
- Progress tracking functions
- Invalid files rejected gracefully
```

### 6.4 Export During Recording Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Export operations don't interfere with active recording

```typescript
// Test Steps:
1. Create session and start recording
2. Perform several interactions to create steps
3. Initiate export while recording is active
4. Continue recording during export
5. Verify export includes new steps
6. Verify recording continues uninterrupted
7. Test WebSocket stability throughout

// Expected Results:
- Export includes all steps up to export time
- Recording continues normally during export
- No WebSocket stability issues
- New steps created during export included
- Performance impact minimal (<20% slowdown)
```

### 6.5 Large File Export Test
**Priority**: Medium  
**Duration**: 8-10 minutes  
**Expected Behavior**: Large sessions export efficiently without resource issues

```typescript
// Test Steps:
1. Create session with maximum steps (200)
2. Ensure screenshots are high quality
3. Initiate export operations for each format
4. Monitor resource usage during export:
   - Memory consumption
   - CPU usage
   - Disk I/O
   - Network bandwidth
5. Verify export completion
6. Test import of large file
7. Verify cleanup after export

// Expected Results:
- Exports complete within 5 minutes
- Memory usage stays below 1GB
- CPU usage reasonable (<80%)
- No disk space issues
- No WebSocket timeouts
- Proper cleanup after completion
```

### 6.6 Concurrent Export Test
**Priority**: Medium  
**Duration**: 6-8 minutes  
**Expected Behavior**: Multiple concurrent exports handled correctly

```typescript
// Test Steps:
1. Create multiple sessions with steps
2. Initiate exports for multiple sessions simultaneously
3. Monitor system performance
4. Verify all exports complete successfully
5. Test WebSocket connections during concurrent exports
6. Verify resource isolation between exports

// Expected Results:
- All exports complete successfully
- No resource conflicts between exports
- WebSocket connections remain stable
- Performance degrades gracefully
- No crashes or hangs
```

### 6.7 Export File Integrity Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: Exported files are complete and valid

```typescript
// Test Scenarios:
A) File Completeness:
   1. Export session to various formats
   2. Verify file sizes are reasonable
   3. Check file headers/magic numbers
   4. Verify all referenced images present
   5. Test file opening in standard viewers

B) Content Accuracy:
   1. Export session with known content
   2. Verify all steps included in export
   3. Verify step order maintained
   4. Verify metadata accuracy
   5. Verify screenshot quality

C) Cross-Platform Compatibility:
   1. Export to various formats
   2. Test file opening on different platforms
   3. Verify encoding compatibility
   4. Test image format compatibility

// Expected Results:
- All exported files valid and complete
- Content matches original session
- Files open correctly in standard tools
- No corruption during export process
```

## Critical Monitoring Points

### Export Performance
- Export completion time < 5 minutes for 200 steps
- Memory usage < 1GB during export
- CPU usage < 80% during export
- No WebSocket timeouts during export

### Import Reliability
- Import success rate 99%+
- File validation prevents invalid imports
- Progress tracking accurate
- Error handling graceful

### File Integrity
- All exported files valid and complete
- No data loss during export/import
- Image quality preserved
- Metadata accuracy maintained

## Failure Indicators

- Export operations timeout (>10 minutes)
- Exported files corrupted or incomplete
- Import operations fail frequently
- WebSocket stability affected by file operations
- Resource exhaustion during file operations
- Memory leaks from file handling

## Success Indicators

- Export operations complete within 5 minutes
- 99%+ import success rate
- Files open correctly in standard tools
- No WebSocket impact from file operations
- Stable memory usage
- Clean resource cleanup

## Automated Test Commands

```bash
# Run import/export tests
npm run test:import-export

# Run specific export format
npm run test:import-export -- --grep "PDF Export"

# Run with file debugging
npm run test:import-export -- --debug-files --verbose
```

## Environment Requirements

```bash
# Import/export testing environment
MAX_STEPS_PER_SESSION=200
TEMP_DIR=/tmp/stepwise-test
EXPORT_TIMEOUT_MS=300000
MAX_FILE_SIZE_MB=100
```

## Test Data

### Sample Session Data
- Simple session: 5-10 steps, basic interactions
- Medium session: 50 steps, mixed interaction types
- Large session: 200 steps, maximum complexity
- Complex session: Dynamic content, file uploads, etc.

### Export Format Validation

```typescript
// PDF Validation
{
  pages: 10,
  images: 200,
  text: "Complete step-by-step guide",
  metadata: { title, author, date }
}

// DOCX Validation  
{
  sections: 10,
  images: 200,
  formatting: "Professional",
  compatibility: "Word 2016+"
}

// ZIP Validation
{
  html: "index.html present",
  images: "All screenshots present",
  structure: "Proper directory layout"
}

// Markdown Validation
{
  markdown: "Complete guide text",
  images: "Relative paths correct",
  links: "Internal links working"
}
```

### Import Test Files
- Valid .stepwise file with password
- Valid .stepwise file without password  
- Corrupted .stepwise file
- Invalid format file
- Oversized file (>100MB)
- Empty file
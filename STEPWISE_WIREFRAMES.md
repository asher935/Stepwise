# Stepwise Application Wireframes and Documentation

## Overview

Stepwise is a browser automation and testing tool that allows users to record browser interactions into step-by-step guides with screenshots. This document provides detailed wireframes and descriptions of all screens, layouts, and functions in the application.

---

## 1. Lobby Screen

### Location
`packages/client/src/components/Layout/Lobby.tsx`

### Purpose
Entry point for new users to create sessions or import existing guides.

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│                    STEPWISE LOGO                           │
│                                                             │
│            Create Step-by-Step Browser Guides              │
│                                                             │
│    Record browser interactions automatically with          │
│    screenshots and generate comprehensive guides          │
│                                                             │
│    ┌─────────────────────────────────────────────────┐    │
│    │  🌐 Enter website URL to start                  │    │
│    │  ┌────────────────────────────────────────────┐ │    │
│    │  │ https://example.com                        │ │    │
│    │  └────────────────────────────────────────────┘ │    │
│    └─────────────────────────────────────────────────┘    │
│                                                             │
│    ┌─────────────────────────────────────────────────┐    │
│    │         [ Start New Session ]                   │    │
│    └─────────────────────────────────────────────────┘    │
│                                                             │
│    ┌─────────────────────────────────────────────────┐    │
│    │      [ Import Existing Guide ]                  │    │
│    └─────────────────────────────────────────────────┘    │
│                                                             │
│    [Error message appears here on validation failure]     │
│                                                             │
│               Powered by Chrome DevTools                   │
└─────────────────────────────────────────────────────────────┘
```

### Components and Functions

#### URL Input Field
- **Type**: Text input
- **Purpose**: Enter the website URL to start recording from
- **Validation**: Auto-adds HTTPS prefix if missing
- **Interaction**: Supports Enter key to start session
- **State**: Managed in component local state

#### Start New Session Button
- **Type**: Primary action button
- **Purpose**: Creates new browser session and navigates to editor
- **Loading State**: Shows spinner during session creation
- **Validation**: Validates URL before proceeding
- **Error Handling**: Displays validation errors below button

#### Import Existing Guide Button
- **Type**: Secondary action button
- **Purpose**: Opens import modal for .stepwise files
- **Triggers**: `ImportModal` component
- **State**: Manages modal visibility

### State Management
- Uses local state for URL input
- Error state for validation messages
- Loading state during session creation

---

## 2. Editor Shell

### Location
`packages/client/src/components/Layout/EditorShell.tsx`

### Purpose
Main editor interface for recording and managing browser automation steps.

### Wireframe
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Header                                                                 │
│ ┌─────┐  Stepwise Guide                     Steps: 5  [Import] [Export] │
│ │ ≡   │  [Untitled Guide]                                  [End Session]│
│ └─────┘                                                           [●]    │
├─────────────────────┬───────────────────────────────────────────────────┤
│ Sidebar (Toggle)    │ Main Browser Area                                 │
│ ┌─────┐             │                                                   │
│ │ 1️⃣  │ Step 1     │ ┌─────────────────────────────────────────────┐   │
│ │     │ Navigate    │ │         ◀       [ URL Bar ]    ▶  [🔄]      │   │
│ │     │ to site     │ └─────────────────────────────────────────────┘   │
│ │     │             │                                                   │
│ │ 2️⃣  │ Step 2     │ ┌─────────────────────────────────────────────┐   │
│ │     │ Click login │ │                                             │   │
│ │     │ button      │ │           BROWSER VIEWPORT                  │   │
│ │     │             │ │                                             │   │
│ │ 3️⃣  │ Step 3     │ │         (Interactive Browser Screen)       │   │
│ │     │ Type email  │ │                                             │   │
│ │     │ address     │ │                                             │   │
│ │     │             │ │                                             │   │
│ │ 4️⃣  │ Step 4     │ └─────────────────────────────────────────────┘   │
│ │     │ Click       │                                                   │
│ │     │ submit      │                                                   │
│ │     │             │                                                   │
│ │ 5️⃣  │ Step 5     │                                                   │
│ │     │ Verify      │                                                   │
│ │     │ success     │                                                   │
│ └─────┘             │                                                   │
│                     │                                                   │
│                     │                                                   │
└─────────────────────┴───────────────────────────────────────────────────┘
```

### Layout Components

#### Header Section
- **Sidebar Toggle**: Hamburger menu to collapse/expand sidebar
- **Guide Title**: Editable title (default: "Untitled Guide")
- **Step Counter**: Live count of recorded steps
- **Import Button**: Opens import modal
- **Export Button**: Opens export modal
- **End Session Button**: Terminates current session and returns to lobby
- **Connection Status**: Visual indicator (●) showing WebSocket connection

#### Sidebar Section
- **Collapsible**: Can be toggled via header button
- **Steps List**: Scrollable list of all recorded steps
- **Empty State**: Shows placeholder when no steps recorded
- **Auto-scroll**: Scrolls to newest step during recording

#### Main Browser Area
- **Browser Toolbar**: Navigation controls (Back/Forward/Reload/URL)
- **Browser Viewport**: Interactive browser display area
- **Responsive**: Adapts to sidebar collapsed/expanded state

### State Management
- Uses Zustand `sessionStore` for global state
- Local state for sidebar visibility
- WebSocket connection management

---

## 3. Browser Viewport

### Location
`packages/client/src/components/Browser/Viewport.tsx`

### Purpose
Interactive browser display that captures and simulates user interactions.

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│                                                     [●]     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │               BROWSER SCREEN                        │  │
│  │                                                     │  │
│  │    ┌─────────────────────────────────────────┐     │  │
│  │    │  📝 Login Form                           │     │  │
│  │    │                                         │     │  │
│  │    │  Email:    [_______________]            │     │  │
│  │    │                                         │     │  │
│  │    │  Password: [_______________]            │     │  │
│  │    │                                         │     │  │
│  │    │           [      Login      ]            │     │  │
│  │    └─────────────────────────────────────────┘     │  │
│  │                                                     │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Connection: Connected | Resolution: 1920x1080             │
└─────────────────────────────────────────────────────────────┘
```

### Interactive Features

#### Mouse Interactions
- **Click Events**: Left-click, right-click (context menu)
- **Movement**: Real-time mouse tracking with coordinate transformation
- **Hover**: Mouse enter/leave events
- **Double-click**: Double click detection

#### Keyboard Interactions
- **Type Events**: Complete keyboard input support
- **Special Keys**: Enter, Tab, Escape, modifier keys
- **Character Input**: All printable characters

#### Scroll Support
- **Wheel Events**: Vertical scrolling
- **Trackpad**: Smooth scrolling support
- **Touch**: Scroll gesture support (if available)

### Technical Implementation

#### Coordinate Transformation
- Client viewport coordinates → Browser page coordinates
- Accounts for browser chrome and scaling
- Maintains precision for accurate click targeting

#### Frame Updates
- Real-time image streaming via WebSocket
- Aspect ratio preservation
- Connection state visualization

#### Performance Optimizations
- Event throttling for high-frequency interactions
- Efficient image compression
- Connection state management

---

## 4. Browser Toolbar

### Location
`packages/client/src/components/Browser/Toolbar.tsx`

### Purpose
Navigation controls for the browser session.

### Wireframe
```
┌─────────────────────────────────────────────────────────────────────────┐
│ [◀]  [▶]  [🔄]  [🌐]  https://example.com/login  [● Connected]          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Control Elements

#### Navigation Buttons
- **Back Button [◀]**: Navigate to previous page in history
- **Forward Button [▶]**: Navigate to next page in history
- **Reload Button [🔄]**: Refresh current page

#### URL Input
- **Auto-complete**: HTTPS prefix automatically added
- **Enter Navigation**: Press Enter to navigate to entered URL
- **Visual Indicator**: Globe icon [🌐] for URL field

#### Connection Status
- **Connected [●]**: Green indicator when WebSocket is connected
- **Disconnected [○]**: Red/gray indicator when disconnected
- **Loading [🔄]**: Spinning indicator during page load

### State Management
- Local state for URL input value
- Global connection state from session store
- Navigation history tracking

---

## 5. Step Card

### Location
`packages/client/src/components/Steps/StepCard.tsx`

### Purpose
Individual step display with screenshot preview and editable caption.

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────┐                                                     │
│ │ 1️⃣  │ Step 1: Navigate to login page                     │
│ └─────┘ [Delete]                                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │                                                     │     │
│ │              SCREENSHOT PREVIEW                     │     │
│ │                                                     │     │
│ │  ┌─────────────────────────────────────────┐       │     │
│ │  │  🏠 Homepage                            │       │     │
│ │  │                                         │       │     │
│ │  │     [ Login Button highlighted ]        │       │     │
│ │  │                                         │       │     │
│ │  └─────────────────────────────────────────┘       │     │
│ │                                                     │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ [Click on highlighted area to view full screenshot]        │
└─────────────────────────────────────────────────────────────┘
```

### Interactive Elements

#### Step Number Badge
- **Visual**: Large emoji number (1️⃣, 2️⃣, 3️⃣, etc.)
- **Purpose**: Quick step identification
- **Position**: Top-left corner

#### Editable Caption
- **Default View**: Shows step action description
- **Edit Mode**: Click to edit inline
- **Save/Cancel**: Enter to save, Escape to cancel
- **Validation**: Prevents empty captions

#### Delete Button
- **Visibility**: Shows on hover only
- **Position**: Top-right corner
- **Confirmation**: No confirmation - immediate delete
- **Visual**: Red trash icon

#### Screenshot Preview
- **Aspect Ratio**: Preserves original screenshot proportions
- **Clipping**: Shows clipped preview if large
- **Interaction**: Click to view full size (potential feature)

### Editing Workflow

1. **View Mode**: Default display with caption and screenshot
2. **Edit Trigger**: Click on caption text
3. **Edit Mode**: Text input appears with cursor
4. **Save**: Enter key or click away saves changes
5. **Cancel**: Escape key reverts to original

### Keyboard Shortcuts
- **Enter**: Save caption when in edit mode
- **Escape**: Cancel editing, revert to original
- **Delete**: Not supported (use delete button)

---

## 6. Export Modal

### Location
`packages/client/src/components/Export/ExportModal.tsx`

### Purpose
Export recorded guides to various formats with customization options.

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ Export Guide                                             ×  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Guide Title:                                               │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ My Step-by-Step Login Tutorial                     │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ Export Format:                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ ◉ PDF (Best for sharing)                           │     │
│ │ ○ Word Document (Editable)                          │     │
│ │ ○ Markdown (Plain text with images)                 │     │
│ │ ○ HTML (Web-ready)                                  │     │
│ │ ○ Stepwise (Re-importable with password)            │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ Password Protection (Stepwise format only):               │
│ ┌─────────────────────────────────────────────────────┐     │
│ │                                             [👁️]   │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│                [  Export Guide  ]  [ Cancel ]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Export Formats

#### PDF Format
- **Use Case**: Professional sharing, printing
- **Features**:
  - Formatted layout with headers
  - Embedded screenshots
  - Table of contents
  - Page numbers

#### Word Document (.docx)
- **Use Case**: Editing, collaboration
- **Features**:
  - Editable text content
  - Embedded images
  - Document formatting
  - Comments support

#### Markdown (.md)
- **Use Case**: Version control, documentation
- **Features**:
  - Plain text with images
  - GitHub/GitLab compatible
  - Easy version tracking
  - Custom styling possible

#### HTML (.html)
- **Use Case**: Web publishing, embedding
- **Features**:
  - Self-contained webpage
  - Embedded base64 images
  - CSS styling
  - Responsive design

#### Stepwise (.stepwise)
- **Use Case**: Re-importing, sharing with password
- **Features**:
  - Complete step data preservation
  - Password encryption
  - Metadata included
  - Re-importable format

### Form Elements

#### Title Field
- **Default**: Current guide title or "Untitled Guide"
- **Validation**: Required field, cannot be empty
- **Character Limit**: 100 characters

#### Format Selection
- **Radio Buttons**: Single selection
- **Conditional Fields**: Password field appears only for Stepwise format
- **Format Descriptions**: Helpful descriptions for each option

#### Password Field (Stepwise Only)
- **Visibility**: Appears only when Stepwise format selected
- **Toggle Password**: Eye icon to show/hide password
- **Security**: Encrypted storage in export file

### Export Process
1. **Validation**: Check title and required fields
2. **Processing**: Generate selected format
3. **Download**: Automatic file download
4. **Notification**: Success/error feedback
5. **Modal Close**: Auto-close on successful export

---

## 7. Import Modal

### Location
`packages/client/src/components/Import/ImportModal.tsx`

### Purpose
Import existing .stepwise guide files with preview and password support.

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ Import Guide                                             ×  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Drag & drop your .stepwise file here, or                   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │           [ Browse Files... ]                       │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ 📄 my-login-tutorial.stepwise                      │     │
│ │    5 steps • Created 2 days ago • 2.3 MB           │     │
│ │                                           [Remove] │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ Password (if encrypted):                                   │
│ ┌─────────────────────────────────────────────────────┐     │
│ │                                             [👁️]   │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│                    [  Import Guide  ]  [ Cancel ]           │
│                                                             │
│ [Error: Invalid password or corrupted file]                 │
└─────────────────────────────────────────────────────────────┘
```

### Import Features

#### File Upload Methods
- **Drag & Drop**: Direct file dropping onto upload area
- **Browse Button**: Traditional file picker dialog
- **File Validation**: .stepwise format only

#### File Preview
- **File Name**: Display uploaded filename
- **Metadata**: Step count, creation date, file size
- **Remove Option**: Remove selected file before import
- **Visual Feedback**: File icon and status

#### Password Protection
- **Auto-Detection**: Detects if file is encrypted
- **Password Field**: Appears only for encrypted files
- **Validation**: Password verification before import
- **Error Handling**: Clear error messages for invalid passwords

### Import Process
1. **File Selection**: User selects .stepwise file
2. **Validation**: Check file format and integrity
3. **Password Check**: Request password if encrypted
4. **Preview**: Show file metadata
5. **Import**: Process and load guide data
6. **Session Creation**: Create new session with imported steps
7. **Modal Close**: Return to editor with loaded guide

### Error Handling
- **Invalid Format**: Clear error for non-.stepwise files
- **Corrupted File**: Error message for damaged files
- **Wrong Password**: Specific error for password failures
- **Network Issues**: Handle upload/internet problems

---

## 8. Debug Overlay

### Location
`packages/client/src/components/Debug/DebugOverlay.tsx`

### Purpose
Development-only overlay for debugging WebSocket communication and performance.

**Note**: Only visible in development environment (`import.meta.env.DEV`)

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ 🔧 DEBUG OVERLAY                                           × │
├─────────────────────────────────────────────────────────────┤
│ Connection Status: Connected [●]                            │
│ Session ID: abc123-def456                                   │
│                                                             │
│ Last Sent:                                                  │
│ { "type": "mouse_move", "x": 250, "y": 180 }               │
│                                                             │
│ Last Received:                                              │
│ { "type": "frame_update", "timestamp": 1635123456 }        │
│                                                             │
│ Performance:                                                │
│ FPS: 30 | Latency: 16ms | Messages: 1,247                  │
│                                                             │
│ [ Ping Server ] [ Clear Messages ] [ Export Logs ]          │
│                                                             │
│ Recent Messages:                                            │
│ 10:23:45 - mouse_move: (250, 180)                          │
│ 10:23:44 - frame_update: 1920x1080                         │
│ 10:23:44 - session_start: success                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Debug Information

#### Connection Status
- **Visual Indicator**: Connection state with colored dot
- **Session ID**: Current WebSocket session identifier
- **Reconnection Status**: Automatic reconnection attempts

#### Message Monitoring
- **Last Sent**: Most recent WebSocket message sent to server
- **Last Received**: Most recent WebSocket message received
- **Message History**: Recent message log with timestamps
- **JSON Formatting**: Pretty-printed message objects

#### Performance Metrics
- **FPS**: Frames per second for viewport updates
- **Latency**: Round-trip message latency
- **Message Count**: Total messages exchanged
- **Memory Usage**: Optional memory tracking

### Debug Actions

#### Ping Server
- **Purpose**: Test server responsiveness
- **Implementation**: Send ping message and measure response time
- **Feedback**: Show response time in overlay

#### Clear Messages
- **Purpose**: Clear message history
- **Scope**: Clear debug overlay only, not actual connection

#### Export Logs
- **Purpose**: Save debug information to file
- **Format**: JSON with timestamps and message details
- **Use Case**: Bug reports and performance analysis

### Development Features
- **Hot Reload**: Automatically updates on code changes
- **Error Tracking**: Captures and displays errors
- **WebSocket Events**: Detailed event logging
- **State Inspection**: View current application state

---

## Application Architecture

### Technology Stack

#### Frontend
- **React 18**: Modern React with hooks and concurrent features
- **TypeScript**: Type safety and better developer experience
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible UI component primitives
- **Zustand**: Lightweight state management
- **Lucide React**: Icon library

#### Backend
- **Node.js**: JavaScript runtime
- **Elysia**: Fast web framework for Node.js
- **WebSocket**: Real-time client-server communication
- **Chrome DevTools Protocol**: Browser automation
- **Playwright**: Browser management and control

#### Build & Development
- **Bun**: Package manager and runtime
- **TypeScript**: End-to-end type safety
- **Vite**: Fast build tool and development server

### Data Flow

```
User Interaction
       ↓
React Component Event
       ↓
WebSocket Message
       ↓
Server Handler
       ↓
CDP Bridge (Browser)
       ↓
Browser Action
       ↓
Screenshot/State Update
       ↓
WebSocket Response
       ↓
React State Update
       ↓
UI Re-render
```

### State Management

#### Global State (Zustand)
- **sessionStore**: Session data, steps, connection status
- **uiStore**: UI state, modals, sidebar visibility
- **debugStore**: Debug information and logs

#### Local Component State
- Form inputs and temporary UI state
- Modal visibility
- Loading and error states

### Performance Optimizations

#### Frontend
- **React.memo**: Prevent unnecessary re-renders
- **useCallback**: Memoize event handlers
- **useDebounce**: Optimize high-frequency events
- **Lazy Loading**: Code splitting for modals

#### Backend
- **WebSocket Pooling**: Efficient connection management
- **Screenshot Compression**: Optimize image data
- **Message Batching**: Group related messages
- **Memory Management**: Clean up ended sessions

### Security Considerations

#### Authentication
- **Session Tokens**: Unique token per session
- **Session Limits**: Prevent resource abuse
- **Token Expiration**: Automatic cleanup

#### Data Protection
- **Input Validation**: Sanitize all user inputs
- **XSS Prevention**: Escape dynamic content
- **Password Encryption**: Secure password hashing

---

## Summary

Stepwise provides a comprehensive solution for creating browser automation guides with:

- **Intuitive Interface**: Clean, modern UI with clear visual hierarchy
- **Real-time Recording**: Live browser interaction capture
- **Flexible Export**: Multiple output formats for different use cases
- **Import Functionality**: Reuse and share existing guides
- **Developer Tools**: Extensive debugging capabilities
- **Professional Architecture**: Scalable, maintainable codebase
- **Type Safety**: Full TypeScript implementation
- **Performance**: Optimized for smooth user experience

The application successfully bridges the gap between technical browser automation and user-friendly guide creation, making it accessible to both technical and non-technical users.
## Phase 8: UI Refinements from Reference Design

### Task 8.1: Update Playback Controls with Reference Design

**Agent:** frontend-developer  
**Files:**
- Modify: `packages/client/src/components/Replay/ReplayControls.tsx`

**Dependencies:** Task 5.5 (Steps List)

**Details:**

Bring over the reference design from `@reference-design/components/PlaybackControls.tsx` with these modifications:
- **Remove:** Speed selector (Clock icon + select dropdown for 0.5x, 1x, 1.5x, 2x)
- **Keep:** All other UI elements and styling
- **Adapt:** Use existing `useReplayStore` state instead of `useApp` store
- **Icons:** Use lucide-react icons (already available)

Reference design features to keep:
- Glassmorphism styling with `backdrop-blur-2xl` and rounded-[32px]
- Progress bar with orange theme
- Step counter display (Step X of Y)
- Current step action text
- Play/Pause/Stop buttons with ChevronLeft/ChevronRight navigation
- Error state with retry button
- Orange/cream color palette (#E67E22, #FDF2E9, #BBAFA7, etc.)

---

### Task 8.2: Create Step Insertion Point Component

**Agent:** frontend-developer  
**Files:**
- Create: `packages/client/src/components/Steps/StepInsertionPoint.tsx`
- Modify: `packages/client/src/components/Steps/StepsList.tsx`

**Dependencies:** Task 5.5 (Steps List)

**Details:**

Bring over the reference design from `@reference-design/components/StepInsertionPoint.tsx`:

**StepInsertionPoint.tsx:**
- Animated hover expansion (12px → 80px height)
- Plus button that appears on hover
- Line indicator that highlights on hover
- "Insert" tooltip that fades in
- Orange theme (#E67E22)
- Expand upward animation with cubic-bezier easing

**StepsList.tsx integration:**
- Place `<StepInsertionPoint index={i} />` BEFORE each step
- Also place one at the end (index = steps.length)
- Handle click to insert new step placeholder

---

## Execution Progress

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Monorepo Foundation | ✅ Complete | 2025-12-21 12:04 | 2025-12-21 12:05 |
| 2. Shared Types | ✅ Complete | 2025-12-21 12:05 | 2025-12-21 12:06 |
| 3. Backend Server | ✅ Complete | 2025-12-21 12:06 | 2025-12-21 12:10 |
| 4. Frontend Foundation | ✅ Complete | 2025-12-21 12:10 | 2025-12-21 12:12 |
| 5. Frontend Components | ✅ Complete | 2025-12-21 12:12 | 2025-12-21 12:18 |
| 6. Docker Packaging | ✅ Complete | 2025-12-21 12:18 | 2025-12-21 12:20 |
| 7. Documentation | ✅ Complete | 2025-12-21 12:20 | 2025-12-21 12:36 |
| 8. UI Refinements | ✅ Complete | 2025-12-24 | 2025-12-24 |
| 8.1: Playback Controls | ✅ Complete | 2025-12-24 | 2025-12-24 |
| 8.2: Step Insertion Point | ✅ Complete | 2025-12-24 | 2025-12-24 |

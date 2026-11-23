const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('LIFEOS_PHASE_4_PAGE_2_COCKPIT_STITCH_PROMPT.md');

const content = `# LIFEOS PHASE 4 — PAGE 2: COCKPIT WORKSPACE
## Comprehensive Repository Research, Specification Mapping & Stitch Generation Prompt

\`\`\`
Document Version: 1.0.0
Phase: Phase 4 of 6 (High-Fidelity Visual Design using Google Stitch)
Target Surface: Page 2 — Cockpit Workspace (/cockpit)
Target State: State A — Normal Morning (08:30 Default Orientation)
Container Shell: Approved LifeOS Global Application Shell (Page 1)
Canvas Dimensions: 1600px width x 1000px height (Desktop Electron LTS Host)
Design Direction: Warm Intelligence (Frozen Phase 1.1)
Governing Specifications:
  - LIFEOS_DESIGN_SYSTEM_FOUNDATION_V1.1.md (Frozen Phase 1.1)
  - LIFEOS_PHASE_2_PRODUCT_INFORMATION_ARCHITECTURE_V1.2_FINAL_FROZEN.md (Frozen Phase 2.2)
  - LIFEOS_PHASE_3_WIREFRAMES_AND_INTERACTION_DESIGN_V1.3.md (Frozen Phase 3 V1.3 — Section 6)
  - LIFEOS_PHASE_3_IMPLEMENTATION_BLUEPRINT_V1.1.md (Frozen Phase 3.0 Blueprint)
Date: November 2026
\`\`\`

---

# PART 1 — REPOSITORY FINDINGS

An investigation of \`apps/web/components/dashboard/\`, data-fetching hooks, and WebGL asset pipelines provides the concrete implementation context for the Cockpit workspace:

### 1.1 Existing Dashboard Components & Modernization Strategy
- **\`DashboardHero.tsx\`:** Currently renders a legacy card with an ExE crimson square (\`#E8414A\`), a developer-oriented low-confidence alert (*"Low Telemetry Confidence (45%)"*), and a *"Current Life Phase"* header.
  - *Assessment:* **REPLACE.** Must be transformed into the clean, natural morning greeting (*"Good morning, Arjun"*), daily cadence state (*"Steady"*), and shielded focus metric (*"4.5h uninterrupted"*).
- **\`LifeStateCard.tsx\`:** Currently exposes raw multi-signal scoring formulas (*"System load: 85%"*, *"Recovery capacity: 60%"*, *"Stability: 70%"*, *"Phase selected by multi-signal scoring engine"*).
  - *Assessment:* **REDESIGN.** This leaked internal kernel telemetry violates V2.3.0 semantic intelligence principles. Must be replaced by the **Pacing Wave & Telemetry** card, providing human-language narrative observations (*"7.5h Restorative Rest / Optimal Recovery. Cognitive reserve uncompromised."*) with zero hardcoded percentages or speculative clinical scores.
- **\`TaskPanel.tsx\`:** Displays a standard checklist of tasks with basic priority badges.
  - *Assessment:* **MODERNIZE.** Must be restructured into **Today's Priority Commitments**—a high-density, focused list showing the 2–3 high-leverage commitments for today with state chips (\`Priority\`, \`Calm\`, \`Ritual\`) and focus triggers. Detailed backlog management remains strictly in Execute.
- **\`AssistantCard.tsx\`:** Basic floating chat card.
  - *Assessment:* **REPLACE.** Split into two distinct Cockpit elements: the **Central Aven Core (Fluid Torus)** visual anchor and the adjacent **Contextual Decision Card** with two-button sovereign confirmation (\`[✓ Confirm Hold]\` vs \`[Dismiss]\`).
- **\`ExecutionOverview.tsx\` & \`PredictionsSection.tsx\`:** Prototype widgets displaying synthetic completion forecasts.
  - *Assessment:* **DISCARD FROM COCKPIT.** These clutter daily orientation and belong in Trajectory or deep diagnostics.

---

### 1.2 Aven & The Fluid Torus Pipeline
- **Existing Shader Implementation:** \`apps/web/components/homepage/InterfaceCinema.tsx\` and \`Preloader.tsx\` utilize Three.js / WebGL shader pipelines with GSAP animation curves.
- **Visual Identity:** Phase 1.1 permanently codified the **Fluid Torus** (the open mathematical fluid ring) as Aven's recognized signature form. It emits a calm, living golden amber plasma bloom ($2700\\text{K}$–$3200\\text{K}$ optical warmth), avoiding cartoon avatars, spinning chatbots, or neon AI sparkle clichés.
- **Cockpit Anchor Role:** In Cockpit, **Aven Core** occupies a dedicated central stage ($\sim 140\\text{px}$ diameter) surrounded by generous breathing space. In the Normal Morning state, it operates in its *Idle / Ambient Breathing* state ($0.2\\text{Hz}$ gentle luminosity pulse in Warm Champagne \`#F5E6C8\` and Radiant Amber \`#D98B2B\`).

---

### 1.3 Schedule & Temporal Presentation
- **Legacy Calendar (\`apps/web/app/calendar/\`):** A standard monthly/weekly grid.
- **Cockpit Target:** The upper-right quadrant houses the **Continuous Schedule Stream** with an inline \`[Day]\` / \`[Week]\` scope segmented toggle. It visualizes the current day as a horizontal time continuum ($08:00$ to $20:00$) with a vertical Radiant Amber scrub cursor (\`#D98B2B\` at $10:48\\text{ LIVE}$), active task timeblocks, and scheduled restorative breaks.

---

### 1.4 Pacing & Vitals Telemetry Reality
- **Grounded V2.3.0 Invariant:** The system records factual user inputs (e.g., bedtime, wake time, awakenings, workout tonnage). It does **not** possess medical-grade EEG sleep staging or real-time continuous cortisol telemetry.
- **Strict Non-Fabrication:** The Cockpit Pacing Wave visualizes the user's daily energy cadence as a smooth, calm sinusoidal curve. When morning telemetry is logged, it reflects grounded rest (*"7.5h sleep recorded, 0 awakenings"*); when unrecorded, it gracefully invites a check-in rather than fabricating arbitrary recovery scores.

---

### 1.5 Approved Application Shell Integration
- **Approved Visual Anchor:** The Cockpit workspace renders directly inside the visually approved **Page 1 Global Application Shell**:
  - Floating rounded Left Navigation Rail on the left boundary with an amber glowing circular pill highlighting the active Compass icon.
  - $48\\text{px}$ Top Horizon Bar with \`LifeOS Studio\` pill, active breadcrumb (\`LifeOS / Cockpit — Daily Orientation\`), $6\\text{px}$ ambient voice dot, \`⌘K\` search box, profile pill (\`AJ\`), and window controls.
  - Matte Smoked Obsidian canvas (\`#111113\`) providing a seamless, glare-free optical floor.

---

# PART 2 — SPECIFICATION MAPPING

| Specification Document | Section Reference | Frozen Requirement Mapped to Cockpit Workspace |
|---|---|---|
| **Phase 1.1 Design System** | Section 5 & 8 | Smoked Obsidian (\`#111113\`) canvas, Card Basalt (\`#17171A\`) containers, 1px subtle hairline borders (\`#23242A\`), Parchment White (\`#F7F5F0\`) headlines, Champagne Grey (\`#C5C2BA\`) secondary labels, Radiant Amber (\`#D98B2B\`) time cursor and CTA accents. |
| **Phase 1.1 Design System** | Section 9 | Aven Core: Large macroscopic Fluid Torus ($\sim 140\\text{px}$) rendered in warm golden amber with soft radial plasma bloom. |
| **Phase 2.2 Information Architecture** | Section 4.1 | Cockpit Workspace purpose: 5-second daily orientation and orchestration command center. Answers: *Where do I stand today? What happens right now? What needs attention?* |
| **Phase 3 V1.3 Wireframes** | Section 6.1.1 | Approved High-Density Stitch Composition: Preserves the balanced 6-region arrangement: Top Schedule Stream, Centered Fluid Torus, Contextual Decision Card, Omni-Input Bar, Pacing Wave & Telemetry, Priority Commitments. |
| **Phase 3 V1.3 Wireframes** | Section 6.2.1 | State A: Normal Morning (08:30 Default Orientation) wireframe layout, component states, and interaction boundaries. |
| **Phase 3.0 Blueprint** | Section 4 & 5 | Semantic intelligence compliance: Observations dynamically derived from evidence; zero developer jargon; strict 6-state execution lifecycle for action proposals. |

---

# PART 3 — COCKPIT DESIGN REQUIREMENTS

The Cockpit is arranged in a balanced, high-density, six-region spatial composition:

\`\`\`
+-------------------------------------------------------------------------------------------------------------------------+
| [Top Horizon Bar: LifeOS Studio           [ Ambient Voice: Dot ]                    [ ⌘K Search... ] [AJ] [-][+][x]    ]|
+-------------------------------------------------------------------------------------------------------------------------+
| [Rail] | Good morning, Arjun.                                       | Continuous Schedule Stream            [Day] [Week]|
|  (H)   | CADENCE STATE: Steady (Grounded Observation)               | 08:00       10:00      10:48 LIVE    14:00 16:00|
| Cockpit| SHIELDED TIME: 4.5h uninterrupted                          | [Systems Arch ACTIVE]  [Rest & Air]  [Review]   |
| [ACTV] |------------------------------------------------------------+---------------------------------------------------|
|        |                                                                                                                |
|  (T)   |                            +---------------------------------------+   +-------------------------------------+ |
|Timeline|                            |                                       |   | Contextual Decision     1:00 PM Slot| |
|        |                            |       ( Ambient Fluid Torus )         |   |                                     | |
|  (E)   |                            |                                       |   | Hold 90m focus block?               | |
|Execute |                            |                 AVEN                  |   | Elena's team inquiry advisory notes | |
|        |                            |                                       |   | are buffered. Safeguards arch.      | |
|  (J)   |                            +---------------------------------------+   |                                     | |
|Traject.|                                                                        | BUFFERED: 4 alerts   AUTO: in 45m   | |
|        |                            [ * Ask Aven or log a boundary note... (Mic) (->) ] | [✓ Confirm Hold]   [Dismiss]| |
|  (V)   |                                                                        +-------------------------------------+ |
| Vitals |                                                                                                                |
|        | +---------------------------------------------------------+   +----------------------------------------------+ |
|--------| | Pacing Wave & Telemetry           (Dynamic Observation) |   | Today's Priority Commitments (2 of 3 addressed)|
|  (S)   | |       _.-''''-._           Peak Zone: Morning           |   |                                              | |
|Settings| |      /          \\                                       |   | [x] Systems Architecture & Flow   [Priority] | |
|        | |  ---'            \`---...___                             |   |     Offline boundary contracts - 50m slot    | |
|  (<<)  | |                                                         |   |                                              | |
|Collapse| |  & 7.5h Restorative Rest / Optimal Recovery             |   | [ ] Review Elena's Horizon Brief 14:00 [Calm]| |
|        | |  Cognitive reserve uncompromised. Bandwidth will        |   |     Design advisory notes - 30m slot         | |
|        | |  sustain deep execution until planned evening shutdown. |   |                                              | |
|        | |  Evidence: 0 awakenings, 7.5h sleep recorded.           |   | [ ] Sunset Reflection & Lock 17:30  [Ritual] | |
|        | +---------------------------------------------------------+   +----------------------------------------------+ |
+-------------------------------------------------------------------------------------------------------------------------+
\`\`\`

### 3.1 The Six Primary Regions Detailed

#### Region 1: Morning Orientation Header & Continuous Schedule Stream (Top Canvas)
- **Top-Left (Orientation Greeting):**
  - Primary Greeting: \`Good morning, Arjun.\` (Geist Sans Medium, $26\\text{px}$–$28\\text{px}$, Parchment White \`#F7F5F0\`).
  - Cadence Pill: \`CADENCE STATE: Steady\` (Geist Sans 12px, soft sage accent \`#6B8E7B\` on subtle dark pill).
  - Shielded Time: \`SHIELDED TIME: 4.5h uninterrupted\` (JetBrains Mono 12px, Warm Champagne \`#F5E6C8\`).
- **Top-Right (Continuous Schedule Stream):**
  - Container: Basalt plate (\`#17171A\`) with $1\\text{px}$ border (\`#23242A\`), height $\\sim 84\\text{px}$.
  - Header: Label \`Continuous Schedule Stream\` and segmented toggle \`[Day] [Week]\` (\`Day\` selected in \`#282930\`).
  - Stream Bar: Horizontal timeline from 08:00 to 20:00 with distinct timeblocks:
    - \`08:00 - 10:30\`: *[Systems Arch & Contracts]* (Solid amber wash \`rgba(217,139,43,0.15)\` with \`ACTIVE\` badge).
    - \`10:48 LIVE Cursor\`: Vertical 2px Radiant Amber indicator needle (\`#D98B2B\`) with floating time badge.
    - \`12:30 - 13:30\`: *[Rest & Air]* (Subtle basalt block \`#1E1F24\` with muted outline).
    - \`14:00 - 15:30\`: *[Review Elena's Brief]* (Solid calendar event plate).
    - Past timeblocks rendered with dimmed opacity ($60\\%$).

#### Region 2: Aven Core — Fluid Torus (Center Stage)
- **Position:** True visual center of the upper-middle canvas.
- **Visual Presentation:** Large macroscopic **Fluid Torus** ($\sim 140\\text{px}$ diameter) rendered in glowing golden amber plasma (\`#F5E6C8\` inner core blending outward into \`#D98B2B\` and warm obsidian darks).
- **Behavior (Normal Morning):** Calm, organic ambient breathing pulse ($0.2\\text{Hz}$). Below the torus, a crisp, understated label reads \`AVEN\` in JetBrains Mono ($11\\text{px}$, letter-spacing \`+0.15em\`, Champagne Grey \`#C5C2BA\`).
- **Role:** Pure ambient focal presence. It is **not** an intrusive animated chatbot or cartoon mascot.

#### Region 3: Contextual Decision Card (Beside Aven Core)
- **Position:** Immediately to the right of the Fluid Torus (dimensions: $\\sim 380\\text{px}$ width $\\times 200\\text{px}$ height).
- **Surface:** Elevated Basalt (\`#1E1F24\`) with a $1\\text{px}$ hairline border in \`#32343D\` and subtle amber glow.
- **Card Content:**
  - Header: \`Contextual Decision\` with time chip \`1:00 PM Slot\`.
  - Question / Proposal: \`Hold 90m focus block?\` (Geist Sans Medium, $16\\text{px}$, \`#F7F5F0\`).
  - Contextual Rationale: \`Elena's team inquiry advisory notes are buffered. Holding safeguards architecture.\` (Geist Sans 13px, \`#C5C2BA\`).
  - Telemetry Chips: \`BUFFERED: 4 alerts\` • \`AUTO-RESOLVE: in 45m\` (JetBrains Mono 11px, \`#85827A\`).
  - **Sovereign Action Dock:** Two prominent buttons:
    - Primary: \`[✓ Confirm Hold]\` (Solid Radiant Amber \`#D98B2B\`, dark text \`#111113\`, font-medium).
    - Secondary: \`[Dismiss]\` (Basalt background \`#17171A\`, subtle border, \`#C5C2BA\` text).

#### Region 4: Omni-Input Prompt Bar (Below Aven Core)
- **Position:** Spans below the Fluid Torus and Decision Card ($\\sim 620\\text{px}$ width $\\times 48\\text{px}$ height).
- **Surface:** Deep Basalt (\`#17171A\`) with $1\\text{px}$ border (\`#23242A\`) and rounded-full pill shape.
- **Input Elements:**
  - Prefix: Radiant amber sparkle dot (\`*\`).
  - Placeholder: \`Ask Aven, express an intention, or log a boundary note...\` (Geist Sans 13px, \`#85827A\`).
  - Right Controls: Microphone icon (\`Mic\` for ambient voice trigger) and forward action arrow (\`->\` submit button).

#### Region 5: Pacing Wave & Telemetry (Bottom-Left)
- **Position:** Bottom-left quadrant (dimensions: $\\sim 48\\%$ canvas width $\\times 240\\text{px}$ height).
- **Surface:** Card Basalt (\`#17171A\`) with $1\\text{px}$ hairline border (\`#23242A\`) and $20\\text{px}$ internal padding.
- **Card Content:**
  - Header: \`Pacing Wave & Telemetry\` with tag \`(Dynamic Observation)\`.
  - Peak Zone Indicator: \`Peak Zone: Morning\` (Warm Champagne \`#F5E6C8\`).
  - Waveform Visualizer: Smooth, elegant organic bezier curve in Radiant Amber/Champagne illustrating expected circadian energy cadence through the day.
  - Natural Language Observation:
    - Headline: \`7.5h Restorative Rest / Optimal Recovery\` (Geist Sans Medium, \`#F7F5F0\`).
    - Narrative: \`Cognitive reserve uncompromised. Bandwidth will sustain deep execution until planned evening shutdown.\`
    - Grounded Evidence: \`Evidence: 0 awakenings, 7.5h sleep recorded.\` (JetBrains Mono 11px, \`#85827A\`).

#### Region 6: Today's Priority Commitments (Bottom-Right)
- **Position:** Bottom-right quadrant (dimensions: $\\sim 48\\%$ canvas width $\\times 240\\text{px}$ height).
- **Surface:** Card Basalt (\`#17171A\`) with $1\\text{px}$ hairline border (\`#23242A\`) and $20\\text{px}$ internal padding.
- **Card Content:**
  - Header: \`Today's Priority Commitments\` with progress counter \`(2 of 3 addressed)\`.
  - Task List Rows (Clean, high-density rows separated by $1\\text{px}$ subtle dividers):
    1. \`[x] Systems Architecture & Service Flow\` — Subtext: *Offline boundary contracts - 50m slot* • Chip: \`[Priority]\` (Amber tint).
    2. \`[ ] Review Elena's Horizon Brief\` — Subtext: *Design advisory notes - 30m slot at 14:00* • Chip: \`[Calm]\` (Sage tint).
    3. \`[ ] Sunset Reflection & Evening Lock\` — Subtext: *Daily review at 17:30* • Chip: \`[Ritual]\` (Muted grey tint).
  - Hover Action: Subtle play button icon \`[Start Focus]\` appearing on hover for in-flight tasks.

---

# PART 4 — FINAL STITCH PROMPT
*(Copy and paste the exact text block below directly into Google Stitch)*

\`\`\`markdown
# SCREEN DESIGN PROMPT: LIFEOS COCKPIT WORKSPACE — NORMAL MORNING STATE (PAGE 2)

Generate a production-grade, pixel-perfect desktop UI design for the **Cockpit Workspace** of **LifeOS** in its primary **State A: Normal Morning (08:30 Default Orientation)**.

This design must seamlessly render inside the approved **LifeOS Global Application Shell** (Page 1) established previously.

---

## 1. CANVAS & SHELL INTEGRATION
- **Canvas Dimensions:** 1600px width x 1000px height (Desktop Electron LTS, 16:10 aspect ratio).
- **Shell Preservation:** Retain the approved Page 1 Shell frame:
  - **Left Rail (56px collapsed width):** Floating rounded vertical dock on the left with the top Compass icon highlighted by a solid 2px Radiant Amber bar (#D98B2B) and warm amber circular glow. Remaining icons (Timeline, Execute, Trajectory, Vitals, Settings, Collapse) in Champagne Grey (#C5C2BA).
  - **Top Horizon Bar (48px height):** Fixed header showing 'LifeOS Studio' pill on left, active breadcrumb 'LifeOS / Cockpit — Morning Orientation', center 6px amber Ambient Voice Dot (#D98B2B), right 'Search commands, notes...' (⌘K), user avatar 'AJ' with green online sync dot, and native window controls ([-] [+] [✕]).
  - **Main Canvas Area (1544px x 952px):** Hosts the Cockpit workspace on a deep Smoked Obsidian canvas (#111113).

---

## 2. COLOR PALETTE & DESIGN TOKENS
- **Canvas Base:** \`#111113\` (Smoked Obsidian)
- **Card Panels:** \`#17171A\` (Card Basalt)
- **Elevated Modals / Decision Cards:** \`#1E1F24\` (Elevated Basalt)
- **Container Borders:** \`#23242A\` (Subtle 1px hairline border — no heavy drop shadows)
- **Interactive Borders:** \`#32343D\` (Hover outlines and card accents)
- **Primary Typography:** \`#F7F5F0\` (Parchment White — 100% contrast)
- **Secondary Typography:** \`#C5C2BA\` (Champagne Grey — 80% contrast)
- **Muted Metadata:** \`#85827A\` (Weathered Stone — 55% contrast)
- **Radiant Amber Accent:** \`#D98B2B\` (Time scrub cursor, active task indicators, primary CTA)
- **Warm Champagne Core:** \`#F5E6C8\` (Aven Torus inner plasma highlight, focus metrics)
- **Organic Sage:** \`#4D6357\` / \`#6B8E7B\` (Calm chips, completed tasks, restorative rest)
- **Disruption Hazard:** \`#E68A35\` (Buffered alerts, schedule shifts)

---

## 3. COCKPIT WORKSPACE COMPOSITION (NORMAL MORNING STATE)

Arrange the Cockpit interior into the approved balanced, high-density six-region composition:

\`\`\`
+---------------------------------------------------------------------------------------------------+
| Good morning, Arjun.                                    | Continuous Schedule Stream  [Day] [Week]|
| CADENCE STATE: Steady (Grounded Observation)            | 08:00    10:00   10:48 LIVE  14:00 16:00|
| SHIELDED TIME: 4.5h uninterrupted                       | [Systems Arch ACTIVE]  [Break]  [Review]|
|---------------------------------------------------------+-----------------------------------------|
|                                                                                                   |
|                         +-----------------------------------+   +-------------------------------+ |
|                         |                                   |   | Contextual Decision 1:00 PM   | |
|                         |      ( Ambient Fluid Torus )      |   |                               | |
|                         |                                   |   | Hold 90m focus block?         | |
|                         |               AVEN                |   | Elena's inquiry is buffered.  | |
|                         +-----------------------------------+   | BUFFERED: 4 alerts  AUTO: 45m | |
|                                                                 | [✓ Confirm Hold]     [Dismiss]| |
|                         [ * Ask Aven or log a note... (Mic)(->) ]+-------------------------------+ |
|                                                                                                   |
| +------------------------------------------------------+   +------------------------------------+ |
| | Pacing Wave & Telemetry        Peak Zone: Morning    |   | Priority Commitments (2 of 3)      | |
| |       _.-''''-._                                     |   | [x] Systems Arch & Flow  [Priority]| |
| |  ---'            \`---...___                          |   |     Offline contracts - 50m slot   | |
| | 7.5h Restorative Rest / Optimal Recovery             |   | [ ] Review Elena's Brief    [Calm] | |
| | Cognitive reserve uncompromised. Bandwidth sustained.|   | [ ] Sunset Reflection       [Ritual| |
| | Evidence: 0 awakenings, 7.5h sleep recorded.         |   |                                    | |
| +------------------------------------------------------+   +------------------------------------+ |
+---------------------------------------------------------------------------------------------------+
\`\`\`

### Region 1: Morning Orientation & Continuous Schedule Stream (Top)
- **Top-Left Header:**
  - Headline: "Good morning, Arjun." (Geist Sans Medium 26px, Parchment White \`#F7F5F0\`).
  - Cadence Pill: "CADENCE STATE: Steady" (Geist Sans 12px, soft sage text \`#6B8E7B\` on dark basalt pill).
  - Shielded Time: "SHIELDED TIME: 4.5h uninterrupted" (JetBrains Mono 12px, Warm Champagne \`#F5E6C8\`).
- **Top-Right Continuous Schedule Stream:**
  - Surface: Basalt container (\`#17171A\`) with 1px border (\`#23242A\`), height ~84px.
  - Header: "Continuous Schedule Stream" with a segmented toggle pill "[Day] [Week]" ('Day' active in \`#282930\`).
  - Schedule Track: Horizontal timeline from 08:00 to 20:00 with distinct timeblocks:
    - "08:00 - 10:30 [Systems Arch & Contracts]" (Solid amber wash \`rgba(217,139,43,0.15)\` with 'ACTIVE' badge).
    - "10:48 LIVE Cursor": Vertical 2px Radiant Amber needle (\`#D98B2B\`) with a floating live time badge.
    - "12:30 - 13:30 [Rest & Air]" (Subtle basalt block \`#1E1F24\`).
    - "14:00 - 15:30 [Review Elena's Brief]" (Calendar event plate).
    - Past timeblocks rendered at 60% opacity.

### Region 2: Central Aven Core — Fluid Torus (Center Stage)
- **Center Stage Visual Anchor:** A large macroscopic **Fluid Torus** (~140px diameter) rendered in glowing golden amber plasma (\`#F5E6C8\` blending outward into \`#D98B2B\` with subtle radial glow).
- **State:** Calm ambient breathing pulse (0.2Hz).
- **Label:** Below the Torus, a crisp label "AVEN" in JetBrains Mono 11px (tracking +0.15em, Champagne Grey \`#C5C2BA\`).
- **Nature:** Organic, intelligent presence — NOT a cartoon avatar, generic AI chatbot circle, or neon purple gradient.

### Region 3: Contextual Decision Card (Beside Aven Core)
- **Placement:** Immediately to the right of the Fluid Torus (width ~380px x height ~200px).
- **Surface:** Elevated Basalt (\`#1E1F24\`) with 1px border (\`#32343D\`) and subtle amber glow.
- **Content:**
  - Card Header: "Contextual Decision" with time tag "1:00 PM Slot".
  - Decision Title: "Hold 90m focus block?" (Geist Sans Medium 16px, \`#F7F5F0\`).
  - Rationale: "Elena's team inquiry advisory notes are buffered. Holding safeguards architecture." (Geist Sans 13px, \`#C5C2BA\`).
  - Status Indicators: "BUFFERED: 4 alerts" • "AUTO-RESOLVE: in 45m" (JetBrains Mono 11px, \`#85827A\`).
  - Sovereign Action Dock: Two prominent buttons:
    - Primary: "[✓ Confirm Hold]" (Solid Radiant Amber \`#D98B2B\` with dark text \`#111113\`).
    - Secondary: "[Dismiss]" (Basalt \`#17171A\` with 1px border and \`#C5C2BA\` text).

### Region 4: Omni-Input Prompt Bar (Below Torus)
- **Placement:** Centered horizontally below the Fluid Torus and Decision Card (width ~620px x height 48px).
- **Surface:** Rounded-full pill in Deep Basalt (\`#17171A\`) with 1px border (\`#23242A\`).
- **Input Elements:**
  - Amber sparkle glyph ("*").
  - Placeholder: "Ask Aven, express an intention, or log a boundary note..." (Geist Sans 13px, \`#85827A\`).
  - Right controls: Microphone icon (ambient voice dictation) and arrow submit button (->).

### Region 5: Pacing Wave & Telemetry (Bottom-Left)
- **Placement:** Bottom-left quadrant (width ~48% of canvas, height ~240px).
- **Surface:** Basalt card (\`#17171A\`) with 1px border (\`#23242A\`) and 20px padding.
- **Content:**
  - Header: "Pacing Wave & Telemetry" with "(Dynamic Observation)" tag.
  - Energy Curve: A smooth, organic bezier wave in Radiant Amber/Champagne illustrating expected daily energy cadence.
  - Peak Zone: "Peak Zone: Morning" in Warm Champagne (\`#F5E6C8\`).
  - Natural Language Narrative:
    - "7.5h Restorative Rest / Optimal Recovery" (Geist Sans Medium 15px, \`#F7F5F0\`).
    - "Cognitive reserve uncompromised. Bandwidth will sustain deep execution until planned evening shutdown."
    - "Evidence: 0 awakenings, 7.5h sleep recorded." (JetBrains Mono 11px, \`#85827A\`).
  - Strictly NO developer jargon, NO "Multi-Signal Scoring Engine", NO fake percentage scores.

### Region 6: Today's Priority Commitments (Bottom-Right)
- **Placement:** Bottom-right quadrant (width ~48% of canvas, height ~240px).
- **Surface:** Basalt card (\`#17171A\`) with 1px border (\`#23242A\`) and 20px padding.
- **Content:**
  - Header: "Today's Priority Commitments" with counter "(2 of 3 addressed)".
  - High-Density Task Items:
    1. "[x] Systems Architecture & Service Flow" — Subtext: "Offline boundary contracts - 50m slot" • Chip: "[Priority]" (Amber tint).
    2. "[ ] Review Elena's Horizon Brief 14:00" — Subtext: "Design advisory notes - 30m slot" • Chip: "[Calm]" (Sage tint).
    3. "[ ] Sunset Reflection & Evening Lock 17:30" — Subtext: "Daily review" • Chip: "[Ritual]" (Muted grey).
  - Hover Action: Faint play icon "[Start Focus]" appearing on in-flight tasks.

---

## 4. DESIGN POLISH & LANGUAGE CONSTRAINTS
- **Natural Human Tone:** Use calm, executive-grade language ("Good morning", "Shielded time", "Hold 90m focus block").
- **Strictly Prohibited:** NO "Active Layer", NO "Execution Kernel", NO "Cognitive Optimization Index", NO "System Readiness".
- **Visual Discipline:** Matte basalt surfaces separated by delicate 1px hairline borders (#23242A). Absolutely no loud neon gradients, no purple AI effects, and no comic book gamification confetti.
\`\`\`

---

# PART 5 — REVIEW CHECKLIST

Use this checklist to rigorously evaluate Stitch's generated Cockpit design output:

- [ ] **Shell Preservation:** The approved Page 1 Global Application Shell is intact (floating rounded Left Rail with active Compass icon, 48px Top Horizon Bar, window controls).
- [ ] **Six-Region Composition:** All 6 required regions are distinctly rendered without omission or rearrangement:
  - [ ] 1. Morning Orientation & Continuous Schedule Stream (Top)
  - [ ] 2. Aven Core — Fluid Torus (Center Stage)
  - [ ] 3. Contextual Decision Card (Beside Torus)
  - [ ] 4. Omni-Input Prompt Bar (Below Torus)
  - [ ] 5. Pacing Wave & Telemetry (Bottom-Left)
  - [ ] 6. Today's Priority Commitments (Bottom-Right)
- [ ] **Continuous Schedule Stream:** Includes live time scrub cursor at 10:48 in Radiant Amber (#D98B2B), distinct timeblocks, and Day/Week segmented toggle.
- [ ] **Fluid Torus Visual Anchor:** Renders as a macroscopic (~140px) mathematical open fluid ring in golden amber plasma with gentle ambient pulse. Zero cartoon mascots, zero purple AI gradients.
- [ ] **Contextual Decision Card:** Displays clear contextual reasoning, buffered alert count, auto-resolve timer, and sovereign two-button action dock (`[✓ Confirm Hold]` vs `[Dismiss]`).
- [ ] **Omni-Input Bar:** Rounded-full pill below the Torus with natural prompt, microphone icon, and submit button.
- [ ] **Pacing Wave & Telemetry:** Features a smooth organic energy curve and natural language narrative grounded in factual evidence ("7.5h sleep recorded, 0 awakenings"). Zero developer jargon or fake clinical percentages.
- [ ] **Priority Commitments:** High-density list with status chips (`Priority`, `Calm`, `Ritual`), progress counter ("2 of 3 addressed"), and clear task hierarchy.
- [ ] **Color Palette & Typography:** Strict Warm Intelligence tokens (Smoked Obsidian `#111113`, Card Basalt `#17171A`, Radiant Amber `#D98B2B`, Warm Champagne `#F5E6C8`, Geist Sans + JetBrains Mono).
`;

fs.writeFileSync(targetPath, content, 'utf8');
console.log(`Successfully generated ${targetPath}`);
console.log(`Size: ${Buffer.byteLength(content, 'utf8')} bytes`);
console.log(`Lines: ${content.split('\n').length}`);

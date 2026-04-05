# Dice Link - External PC Application

## Project Overview

**Dice Link** is a desktop PC application that connects to the Foundry VTT module "Dice Link Companion" (DLC) via WebSocket. Its purpose is to allow tabletop RPG players to use **physical dice** instead of digital dice rolls.

### How It Works

1. A player triggers an action in Foundry VTT (e.g., clicks "Attack" on their character sheet)
2. Foundry generates a roll configuration dialog
3. DLC intercepts this dialog, hides it, extracts all the data, and sends it to Dice Link via WebSocket
4. Dice Link displays the configuration options and dice requirements to the user
5. The user makes any configuration choices and physically rolls their dice
6. Dice Link uses a webcam to detect the dice types and read the results
7. Dice Link sends the results back to DLC
8. DLC injects the results into Foundry and triggers the roll completion
9. The roll appears in Foundry's chat with the physical dice values

### Key Principle

**DLC and Dice Link communicate only through a defined WebSocket message protocol.** Neither needs to know the internal implementation of the other. This keeps the systems decoupled - UI changes, refactoring, or feature additions on either side should not break the connection as long as the message protocol is respected.

---

## Technology Stack (Recommended)

- **Electron** - Cross-platform desktop application framework
- **TypeScript/JavaScript** - Application logic
- **WebSocket Server** - To accept connections from DLC (DLC is the client)
- **HTML/CSS** - User interface
- **Canvas API** - Video capture and display
- **TensorFlow.js or similar** - Dice detection and OCR (future phase)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DICE LINK (This App)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  WebSocket  │    │     UI      │    │   Camera    │     │
│  │   Server    │◄──►│  Renderer   │◄──►│   Module    │     │
│  └──────┬──────┘    └─────────────┘    └─────────────┘     │
│         │                                     │             │
│         │           ┌─────────────┐           │             │
│         └──────────►│    State    │◄──────────┘             │
│                     │   Manager   │                         │
│                     └─────────────┘                         │
│                            │                                │
│                     ┌─────────────┐                         │
│                     │    Dice     │                         │
│                     │  Detection  │                         │
│                     └─────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ WebSocket Connection
         ▼
┌─────────────────────────────────────────────────────────────┐
│              FOUNDRY VTT + DLC (External System)            │
│                                                             │
│  DLC connects as a WebSocket CLIENT to Dice Link's server   │
│  Default connection: ws://localhost:8765                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## WebSocket Message Protocol

All messages are JSON objects with a `type` field indicating the message type.

### Connection Management

**DLC → Dice Link: Connection Handshake**
```json
{
  "type": "connect",
  "version": "1.0.0",
  "clientId": "unique-session-id",
  "playerName": "Mike",
  "playerId": "foundry-user-id"
}
```

**Dice Link → DLC: Connection Acknowledged**
```json
{
  "type": "connected",
  "version": "1.0.0",
  "serverName": "Dice Link"
}
```

---

### Roll Request Flow

**DLC → Dice Link: Roll Request**

Sent when a player triggers a roll in Foundry and DLC intercepts the dialog.

```json
{
  "type": "rollRequest",
  "id": "unique-roll-id-12345",
  "timestamp": 1699999999999,
  "player": {
    "id": "foundry-user-id",
    "name": "Mike"
  },
  "roll": {
    "title": "Longsword Attack",
    "subtitle": "Melee Weapon Attack",
    "formula": "1d20 + 5 + 1d4",
    "dice": [
      { "type": "d20", "count": 1 },
      { "type": "d4", "count": 1 }
    ]
  },
  "config": {
    "fields": [
      {
        "name": "attackMode",
        "label": "Attack Mode",
        "type": "select",
        "options": [
          { "value": "oneHanded", "label": "One-Handed" },
          { "value": "twoHanded", "label": "Two-Handed" }
        ],
        "selected": "oneHanded"
      },
      {
        "name": "rollMode",
        "label": "Roll Mode",
        "type": "select",
        "options": [
          { "value": "publicroll", "label": "Public Roll" },
          { "value": "gmroll", "label": "GM Only" },
          { "value": "blindroll", "label": "Blind Roll" },
          { "value": "selfroll", "label": "Self" }
        ],
        "selected": "publicroll"
      },
      {
        "name": "situationalBonus",
        "label": "Situational Bonus",
        "type": "text",
        "value": ""
      }
    ]
  },
  "buttons": [
    { "id": "advantage", "label": "Advantage" },
    { "id": "normal", "label": "Normal" },
    { "id": "disadvantage", "label": "Disadvantage" }
  ]
}
```

**Dice Link → DLC: Roll Result**

Sent when the user has completed configuration, rolled their dice, and Dice Link has captured the results.

```json
{
  "type": "rollResult",
  "id": "unique-roll-id-12345",
  "timestamp": 1699999999999,
  "buttonClicked": "normal",
  "configChanges": {
    "rollMode": "gmroll",
    "situationalBonus": "+2"
  },
  "results": [
    { "type": "d20", "value": 17 },
    { "type": "d4", "value": 3 }
  ]
}
```

**Dice Link → DLC: Roll Cancelled**

Sent if the user cancels the roll in Dice Link.

```json
{
  "type": "rollCancelled",
  "id": "unique-roll-id-12345",
  "reason": "User cancelled"
}
```

---

### Video Feed (Optional)

**Dice Link → DLC: Video Frame**

If DLC requests video feed, Dice Link can stream frames.

```json
{
  "type": "videoFrame",
  "timestamp": 1699999999999,
  "frame": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**DLC → Dice Link: Request Video Feed**
```json
{
  "type": "requestVideoFeed",
  "enabled": true,
  "fps": 15
}
```

---

### Error Handling

**Either Direction: Error Message**
```json
{
  "type": "error",
  "code": "INVALID_MESSAGE",
  "message": "Unrecognized message type",
  "relatedId": "unique-roll-id-12345"
}
```

---

## User Interface Requirements

### Main Window

The app should display:

1. **Connection Status** - Show if DLC is connected or not
2. **Current Roll Request** (when active):
   - Roll title and subtitle
   - Configuration options (dropdowns, inputs) - user can modify these
   - Dice to roll with visual representation
   - Action buttons (Advantage, Normal, Disadvantage, etc.)
3. **Camera Feed** - Live view from webcam showing the dice rolling area
4. **Detected Results** - Show what dice and values were detected
5. **Confirm/Cancel** - User confirms the detected results or re-rolls

### Settings

- WebSocket port configuration (default: 8765)
- Camera selection
- Detection sensitivity/calibration
- Visual theme (light/dark)

---

## Development Phases

### Phase 1: Core Communication
- Electron app shell
- WebSocket server
- Message handling (receive roll requests, send results)
- Basic UI showing connection status and incoming requests
- Manual dice result entry (no camera yet)

### Phase 2: User Interface
- Full roll request display
- Configuration option editing
- Button rendering and interaction
- Roll result input UI

### Phase 3: Camera Integration
- Camera selection and preview
- Frame capture
- Video feed to DLC (optional feature)

### Phase 4: Dice Detection
- Dice type recognition (d4, d6, d8, d10, d12, d20, d100)
- Value reading
- Result validation (correct dice types rolled?)

---

## Dice Types

Standard RPG dice that must be supported:

| Type | Shape | Values |
|------|-------|--------|
| d4 | Tetrahedron (pyramid) | 1-4 |
| d6 | Cube | 1-6 |
| d8 | Octahedron | 1-8 |
| d10 | Pentagonal trapezohedron | 0-9 or 1-10 |
| d12 | Dodecahedron | 1-12 |
| d20 | Icosahedron | 1-20 |
| d100 | Percentile (two d10s) | 1-100 |

---

## File Structure (Suggested)

```
dice-link/
├── package.json
├── electron/
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # Preload script for IPC
│   └── websocket.ts      # WebSocket server
├── src/
│   ├── App.tsx           # Main React/UI component
│   ├── components/
│   │   ├── ConnectionStatus.tsx
│   │   ├── RollRequest.tsx
│   │   ├── ConfigFields.tsx
│   │   ├── DiceDisplay.tsx
│   │   ├── CameraFeed.tsx
│   │   └── ResultInput.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useCamera.ts
│   ├── state/
│   │   └── rollState.ts
│   └── types/
│       └── messages.ts   # TypeScript types for message protocol
├── assets/
│   └── dice/             # Dice SVG icons (can copy from DLC)
└── README.md
```

---

## Important Notes

1. **DLC is the WebSocket CLIENT, Dice Link is the SERVER** - This allows DLC to reconnect if Dice Link restarts

2. **Dice Link must handle multiple simultaneous roll requests** - Queue them if needed, but typically only one will be active

3. **Results must include exact dice types** - DLC needs to know which die produced which value to correctly fulfill the Foundry roll

4. **The message protocol is the contract** - If you need to add new fields, add them as optional to maintain backwards compatibility

5. **Dice SVG assets** - DLC has SVG dice icons in `dice-link-companion/assets/DLC Dice/` that can be copied to Dice Link for visual consistency

---

## Getting Started Prompt

When starting development, begin with Phase 1:

"Create an Electron desktop application called 'Dice Link' that:
1. Runs a WebSocket server on port 8765
2. Accepts connections from clients
3. Displays connection status in the UI
4. Receives 'rollRequest' messages and displays them
5. Allows manual entry of dice results
6. Sends 'rollResult' messages back when the user submits

Use TypeScript, React for the UI, and follow the message protocol defined in this document."

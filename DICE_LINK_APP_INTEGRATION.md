# Dice Link App (DLA) Integration Guide

This document describes the WebSocket communication protocol between DLC (Dice Link Companion - Foundry module) and DLA (Dice Link App).

## Message Flow (Two-Phase Communication)

### Phase A: Roll Configuration (Button Selection)
1. **DLC → DLA**: `rollRequest` - Sends roll config and available buttons
2. **DLA → DLC**: `buttonSelect` - User selects button (Advantage/Normal/Disadvantage/Critical/Cancel)
3. **DLC**: Clicks hidden Foundry dialog button, triggering dice resolver

### Phase B: Dice Entry (Results Submission)
1. **DLC → DLA**: `diceRequest` - Sends actual dice to roll (determined by Foundry)
2. **DLA**: User enters dice values (manual click or auto-detection)
3. **DLA → DLC**: `diceResult` - Sends dice values
4. **DLC**: Injects values into Foundry resolver and completes roll

### Cancel
- **DLA → DLC**: `rollCancelled` - User cancels at any point
- **DLC**: Closes hidden Foundry dialog and clears state

---

## Message Formats

### 1. Roll Request (DLC → DLA)
Sent when a player initiates a roll in Foundry.

```json
{
  "type": "rollRequest",
  "id": "dlc-1234567890-1",
  "player": {
    "id": "user-uuid",
    "name": "Player Name",
    "isGM": false
  },
  "roll": {
    "title": "Attack Roll",
    "subtitle": "Longsword vs AC",
    "formula": "1d20 + 5",
    "dice": [
      { "type": "d20", "count": 1 }
    ]
  },
  "config": {
    "fields": [
      {
        "name": "Roll.0.situational",
        "label": "Situational Bonus",
        "value": 0,
        "type": "text"
      },
      {
        "name": "ability",
        "label": "Ability",
        "value": "str",
        "type": "select",
        "options": ["str", "dex", "con", "int", "wis", "cha"]
      },
      {
        "name": "rollMode",
        "label": "Roll Mode",
        "value": "publicroll",
        "type": "select",
        "options": ["publicroll", "gmroll", "blindroll", "selfroll"]
      }
    ]
  },
  "buttons": [
    { "label": "Advantage", "id": "advantage" },
    { "label": "Normal", "id": "normal" },
    { "label": "Disadvantage", "id": "disadvantage" },
    { "label": "Critical Hit", "id": "critical hit" },
    { "label": "Cancel", "id": "cancel" }
  ]
}
```

**Notes:**
- `buttons` array contains ALL available buttons for the roll type
- `buttons[].id` is what should be sent back in `buttonSelect`
- `config.fields` may include various configuration options depending on roll type
- `dice` array shows the initial dice requirement (may change based on button selection)

---

### 2. Button Select (DLA → DLC)
Sent when user clicks a button (Advantage/Normal/Disadvantage/Critical/Cancel).

```json
{
  "type": "buttonSelect",
  "id": "dlc-1234567890-1",
  "button": "advantage",
  "configChanges": {
    "Roll.0.situational": 2,
    "ability": "dex"
  }
}
```

**Notes:**
- `button` must match one of the `buttons[].id` values from rollRequest
- `configChanges` is optional - only include fields that changed
- For "Cancel": send `"button": "cancel"` (no other changes needed)

---

### 3. Dice Request (DLC → DLA)
Sent after button is selected and Foundry processes it, showing the actual dice needed.

```json
{
  "type": "diceRequest",
  "originalRollId": "dlc-1234567890-1",
  "rollType": "advantage",
  "formula": "2d20kh",
  "dice": [
    { "type": "d20", "count": 2 }
  ]
}
```

**Notes:**
- `originalRollId` matches the `id` from the original rollRequest
- `rollType` is "advantage", "normal", "disadvantage", or "critical"
- `dice` is an array of dice to roll - count indicates how many of that type
- `formula` is for reference/display (e.g., "2d20kh" = 2d20 keep highest)

---

### 4. Dice Result (DLA → DLC)
Sent when user enters/detects dice values.

```json
{
  "type": "diceResult",
  "originalRollId": "dlc-1234567890-1",
  "results": [
    { "type": "d20", "value": 15 },
    { "type": "d20", "value": 8 }
  ]
}
```

**Notes:**
- `originalRollId` matches the `id` from diceRequest
- `results` array must have same length as `dice` array from diceRequest
- Each result must have `type` (matching dice types from request) and `value` (the rolled result)
- **IMPORTANT**: Die values must be in the correct range:
  - d4: 1-4
  - d6: 1-6
  - d8: 1-8
  - d10: 1-10
  - d12: 1-12
  - d20: 1-20
  - d100: 1-100

---

### 5. Roll Cancelled (DLA → DLC)
Sent when user cancels the roll.

```json
{
  "type": "rollCancelled",
  "id": "dlc-1234567890-1"
}
```

**Notes:**
- Can be sent at any point during Phase A or Phase B
- DLC will close the hidden Foundry dialog and clear state

---

## State Machine for DLA UI

DLA should maintain these states:

### State 1: Idle
- Display: Dice tray with d4-d100 buttons
- Action: Ready to receive `rollRequest`

### State 2: Roll Request (Waiting for button selection)
- Display: Roll title, formula, config options, action buttons
- Received: `rollRequest` message
- Action: User clicks button → send `buttonSelect`

### State 3: Roll Resolution (Waiting for dice values)
- Display: Clickable SVG dice faces for each die in `diceRequest`
- Received: `diceRequest` message
- Action: User enters values → send `diceResult`

### State 4: Cancelled
- Action: Send `rollCancelled` → return to Idle

---

## Important Implementation Notes

1. **Always use lowercase for button IDs** - DLC matches button labels case-insensitively but sends back the exact ID you provide

2. **Preserve originalRollId** - Always use the same ID that was provided in the original message for correlation

3. **Config changes are optional** - Only send fields that actually changed, or omit `configChanges` entirely

4. **Die value ranges** - Foundry uses standard d4-d100 ranges (1-N, not 0-N except for special cases)

5. **No intermediate messages** - Direct communication: rollRequest → buttonSelect → diceRequest → diceResult. Don't send extra messages between these steps

6. **Timeout handling** - If DLC doesn't receive `diceResult` within a reasonable time, it will fall back to manual entry in its own UI

---

## Example Flow

```
1. Foundry Player: "Roll Attack"
   ↓
2. DLC: {type: "rollRequest", id: "dlc-abc123", roll: {...}, buttons: [...]}
   ↓
3. DLA: User clicks "Advantage"
   ↓
4. DLA: {type: "buttonSelect", id: "dlc-abc123", button: "advantage"}
   ↓
5. DLC: Clicks hidden Advantage button in Foundry
   ↓
6. Foundry: Processes, now needs 2d20 (advantage)
   ↓
7. DLC: {type: "diceRequest", originalRollId: "dlc-abc123", formula: "2d20kh", dice: [{type: "d20", count: 2}]}
   ↓
8. DLA: User clicks dice or detects: 15, 12
   ↓
9. DLA: {type: "diceResult", originalRollId: "dlc-abc123", results: [{type: "d20", value: 15}, {type: "d20", value: 12}]}
   ↓
10. DLC: Injects 15 and 12 into Foundry resolver
    ↓
11. Foundry: Completes roll with values, posts to chat
```

---

## Troubleshooting

- **Button not working**: Verify button `id` exactly matches one from `buttons` array
- **Wrong number of dice**: Check `diceRequest.dice` array length matches `results` array length
- **Dice value out of range**: Ensure all values are 1-N, not 0-N
- **Config changes ignored**: Check field names exactly match those in `config.fields[].name`

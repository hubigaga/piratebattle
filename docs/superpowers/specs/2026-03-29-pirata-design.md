# Pirata — Multiplayer Pirate Ship Battle: Design Spec
_2026-03-29_

## Overview
Browser-based multiplayer top-down pirate ship battle game. Node.js authoritative server, Vanilla JS Canvas client, WebSocket transport. No framework, no database.

---

## Stack
| Layer | Tech |
|---|---|
| Server | Node.js, `ws` library |
| Client | Vanilla JS, HTML5 Canvas |
| Transport | WebSocket (binary-friendly JSON) |
| Session | Random UUID in localStorage, username on join |
| Hosting | Caddy reverse proxy (existing infra) |

---

## Login
- Splash screen: enter username → connect
- Server assigns session UUID
- No password, no registration
- Reconnect by same UUID restores ship if still alive

---

## Ship Types
Selection at spawn. Cannons/side = starting value; collected cannons are added to both sides equally.

| Ship | Cannons/Side (start) | Base HP | Max Speed | Turn Rate | Accel |
|---|---|---|---|---|---|
| Schaluppe | 2 | 40 | 220 px/s | 90°/s | 80 |
| Brigantine | 4 | 80 | 180 px/s | 70°/s | 65 |
| Galleone | 8 | 160 | 130 px/s | 50°/s | 45 |
| Linienschiff | 12 | 240 | 100 px/s | 35°/s | 35 |

---

## Cannon Scaling
When a ship sinks, its cannons are split evenly between port and starboard of the victor.

```
totalCannons = portCannons + starboardCannons
sizeFactor   = sqrt(totalCannons / startTotalCannons)
width        = baseWidth  * sizeFactor
height       = baseHeight * sizeFactor
maxHP        = baseHP     * sizeFactor
range        = baseRange  + totalCannons * 12   (px)
damage/ball  = fixed (10 hp)
```

HP scales with size so larger ships are tankier but not exponentially so.

---

## Physics (Server-Side, 60 Hz)

### Movement
```
accel_vec   = forward_dir * accel      (only when UP held)
velocity   += accel_vec * dt
velocity   *= (1 - drag * dt)          // drag ~1.2
speed       = |velocity|

turnSpeed   = maxTurn * clamp(speed / maxSpeed, 0, 1)
angle      += turnInput * turnSpeed * dt   // LEFT/RIGHT arrow
```
No in-place rotation. At zero speed, turn rate = 0.

### Cannonball Physics
```
shotVelocity = sideDir * SHOT_SPEED + forwardDir * shipSpeed * 0.4
```
Ball is a circle (r=4). Lives until range is exhausted (`distanceTravelled >= range`).

### Barrel (Mine)
- Spawned at ship position on DROP key
- Static in water
- Explodes on collision with any ship or after 60 s timeout
- Blast radius: 80 px, damage: 60 hp

---

## Game Objects
All server-side objects have: `id, type, x, y, angle, vx, vy`

| Type | Shape | Notes |
|---|---|---|
| Ship | Rectangle | w/h from cannon scaling |
| Cannonball | Circle r=4 | per-ball object |
| Barrel | Circle r=10 | static, explodes |
| Explosion | Circle (expanding) | visual only, server sends event |

Collision: rectangle-circle and circle-circle (AABB for broad phase).

---

## Controls
| Key | Action |
|---|---|
| Arrow Up | Accelerate |
| Arrow Down | Brake (drag boost) |
| Arrow Left / Right | Turn |
| A | Fire port broadside |
| D | Fire starboard broadside |
| Space | Drop barrel |

---

## Broadside Firing
- All cannons on one side fire simultaneously
- Balls spawn staggered along ship side (evenly spaced)
- Cooldown per side: `1.5 s` (fixed, not affected by cannon count)
- Visual: balls appear with small stagger offset (50 ms apart) for aesthetics

---

## Sinking & Loot
1. Ship HP ≤ 0 → sink event broadcast
2. Victor's cannon count += sunken ship's cannon count (both sides += half each)
3. Ship size/HP recalculated immediately
4. Sunken player sees death screen with score, can respawn with new ship selection

---

## Network Protocol

### Client → Server (inputs, ~60 Hz)
```json
{ "t": "input", "up": bool, "down": bool, "left": bool, "right": bool,
  "firePort": bool, "fireStarboard": bool, "dropBarrel": bool }
```

### Server → Client (game state, ~60 Hz)
```json
{ "t": "state", "tick": int, "ships": [...], "balls": [...], "barrels": [...] }
```

### Server → Client (events)
```json
{ "t": "event", "e": "sink"|"hit"|"explosion", ...payload }
```

Ship state: `{ id, name, x, y, angle, vx, vy, hp, maxHp, portCannons, starboardCannons, width, height }`

Ball state: `{ id, x, y }` (angle/velocity not needed client-side)

---

## Client Rendering
- Canvas 2D, no WebGL
- Camera follows own ship
- Ships: filled rectangles rotated to `angle` + sprite overlay (user-provided)
- Cannonballs: filled circles
- Barrels: filled circles (brown)
- Interpolation: lerp between last two received states for smooth motion
- HUD: HP bar, cannon count, score (kills)

---

## World
- 4000×4000 px torus (wraps at edges)
- Max 20 players per room
- Respawn at random edge point

---

## File Structure
```
pirata/
  server/
    index.js          // entry, HTTP + WS server
    game.js           // game loop, state management
    physics.js        // movement, collision
    ship.js           // ship entity
    projectile.js     // cannonball + barrel
  client/
    index.html
    game.js           // canvas rendering loop
    input.js          // keyboard handler
    net.js            // WebSocket client
    interpolation.js  // state lerp
  docs/
    superpowers/specs/
      2026-03-29-pirata-design.md
```

---

## Out of Scope (v1)
- Rooms / matchmaking UI
- Persistent stats
- Sound
- Animated sprites (rectangles/circles only until sprites provided)
- Chat

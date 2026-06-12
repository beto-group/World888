---
author: beto.group
contributor: []
version: 2.0.12
id: world-888
name: WORLD 888
description: A persistent, physics-enabled 3D world featuring a first-person controller, dual-transport local multiplayer synchronization (Obsidian tabs + Browser clients), and interactive object manipulation.
status: releasable
complexity: advanced
category:
  - 3D Simulation
  - Physics Sandbox
  - Multiplayer Game
  - Web Component
compatibility:
  - Obsidian >=1.4.11
  - Datacore >=0.8.0
  - Modern Web Browsers (Chrome, Firefox, Safari)
repository:
  - https://github.com/beto-group/World888
missing: []
resources:
  - assets/videos/preview.gif
  - assets/image/preview_1.webp
type: DatacoreComponent
target: Datacore + Browser
security:
  - Sandboxed
storage:
  - LocalState
network: Cross-Client Sync (SSE + BroadcastChannel)
runtime: PureJS + Node.js
entry_point: WORLD 888.md
logic: src/index.jsx
---

This file contains the machine-readable packaging manifest and indexing properties for this component.


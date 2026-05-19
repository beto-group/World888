# Contribution Standards

This document outlines the architectural guidelines and design principles required for contributing to the WORLD 888 codebase.

## Architectural Pillars

1. **Zero-Dependency Core**: All engine frameworks and scripts must be loaded dynamically at runtime (e.g., Babylon.js and Havok WASM script loaders). Do not declare npm packaging requirements that would require external installations.
2. **Modular Coordination**: Monolithic files exceeding 500 lines are prohibited. Keep scripts divided by task: physics helpers in `HavokPhysics.js`, loaders in `SceneLoader.js`, camera properties in `CameraLogic.js`, and character controller locomotion inside `CharacterLogic.js`.
3. **Babylon.js & Havok Performance**: Keep physics aggregates and update loops optimized. Always clean up all scene observers, materials, physics engine states, and Babylon engine instances on unmount to prevent frame drops in adjacent Obsidian views.
4. **Anti-Bleed Styling**: All components must restrict styles to their respective namespaces or unique wrapper classes to prevent style spillover into Obsidian workspace panes.

## Development Workflow & Caching

- **Hot Module Replacement (HMR)**: The component uses a dynamic watchdog daemon to monitor `data/mcp_commands.json` inside the root directory. To trigger a live reload of the leaf, dispatch a reload payload:
  ```json
  {
    "action": "reload",
    "executed": false
  }
  ```
- **Audit Checklist**: Before submitting a PR or release tag:
  - Run case-insensitive sensitivity scans ("Beto Clean") for local volumes (`/Volumes/`, `/Users/`) or usernames (`blackbird`).
  - Verify that no emojis are present in any of the UI panels or Markdown headers.

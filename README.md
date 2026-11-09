# Freeze Tag 3D

A rebuilt, code-only version of Freeze Tag using Three.js. No image or model assets.

Run: `npm start`, then open http://localhost:8000 (needs an HTTP server because of ES modules).

- **Characters** (`docs/js/character.js`): procedural jointed humanoids (hips, spine, neck, shoulders, elbows, knees, ankles). Walk-to-run blend, hip/spine counter-rotation, bob, speed lean, turn banking, idle breathing, tag reach, celebration and a frozen pose.
- **Camera** (`docs/js/camera.js`): orbit chase camera with smoothing, look-ahead, speed FOV, auto-follow, zoom, and walls that fade when they block the view.
- **Game** (`docs/js/main.js`, `ai.js`, `world.js`): 3 arenas, A* CPU players with line-of-sight and 4 skill levels, tag, thaw, timer, minimap, touch/keyboard/gamepad.

Controls (change in Match setup or the pause menu; saved on the device):
- **Movement: Joystick · WASD · gamepad** — WASD/arrows, left-thumb floating joystick, or controller. Drag, Q/E or right stick rotate the camera.
- **Movement: Tap / click to move** — tap or click a spot to walk there; hold to steer toward your finger/cursor. Rotate with right-drag (mouse), two-finger drag (touch) or the on-screen ⟲ ⟳ buttons; pinch or wheel to zoom. Keyboard/gamepad still work and cancel the destination.
- **Camera: Separate** — you steer the camera (it eases behind you when idle; toggle in pause menu). **Camera: Follows your character** — the camera turns whenever your character turns.
- Wheel, `-`/`=` zoom; Esc/P pause.

Vision: walls are taller than characters, so anyone you have no line of sight to is hidden in the arena and on the minimap (frozen runners are always shown on the minimap). Everything is revealed when the round ends.

Not carried over from the original: online lobbies, local split-screen, campaign/maze modes, wardrobe, music.

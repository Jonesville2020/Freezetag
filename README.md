# Freeze Tag 3D

A rebuilt, code-only version of Freeze Tag using Three.js. No image or model assets.

Run: `npm start`, then open http://localhost:8000 (needs an HTTP server because of ES modules).

- **Characters** (`docs/js/character.js`): procedural jointed humanoids (hips, spine, neck, shoulders, elbows, knees, ankles). Walk-to-run blend, hip/spine counter-rotation, bob, speed lean, turn banking, idle breathing, tag reach, celebration and a frozen pose.
- **Camera** (`docs/js/camera.js`): orbit chase camera with smoothing, look-ahead, speed FOV, auto-follow, zoom, and walls that fade when they block the view.
- **Game** (`docs/js/main.js`, `ai.js`, `world.js`): 3 arenas, A* CPU players with line-of-sight and 4 skill levels, tag, thaw, timer, minimap, touch/keyboard/gamepad.

Controls: WASD/arrows or left-thumb joystick move; drag, Q/E or right stick rotate; wheel, `-`/`=` zoom; Esc/P pause.

Not carried over from the original: online lobbies, local split-screen, campaign/maze modes, wardrobe, music.

# Freeze Tag 3D

A rebuilt, code-only version of Freeze Tag using Three.js. No image or model assets.

Run: `npm start`, then open http://localhost:8000 (needs an HTTP server because of ES modules).

- **Characters** (`docs/js/character.js`): procedural jointed humanoids (hips, spine, neck, shoulders, elbows, knees, ankles). Walk-to-run blend, hip/spine counter-rotation, bob, speed lean, turn banking, idle breathing, tag reach, celebration and a frozen pose.
- **Camera** (`docs/js/camera.js`): orbit chase camera with smoothing, look-ahead, speed FOV, auto-follow, zoom, and walls that fade when they block the view.
- **Game** (`docs/js/main.js`, `ai.js`, `world.js`): 3 arenas, A* CPU players with line-of-sight and 4 skill levels, tag, thaw, timer, minimap, touch/keyboard/gamepad.

## Modes

- **Freeze Tag:** freeze every runner, or survive until time expires. Rescue is optional.
- **Timed Tag:** five 40-second rounds. Passing IT freezes the new seeker for 3 seconds and gives the previous seeker 4.25 seconds of protection. Lowest total IT time wins; press Next round between rounds.
- **Freeze Outbreak:** three 120-second rounds against a Scout seeker. Frozen runners turn into seekers after 8 seconds unless rescued. Scored seekers steal up to 5 seconds per tag; highest survival score wins.
- **Maze Dash:** explore a randomly generated compact or standard maze and reach the glowing exit. Each local player's time is recorded separately; each can give up without ending the others' run.

Local play supports 1–4 players on one device, with separate views and independent line of sight. Choose each player's controls and screen position in setup or pause. Freeze Tag also lets players choose different sides. P1 uses WASD and P2 uses arrows; P3/P4 use touch or controllers. In 3–4-player games, the first controllers are assigned to P3/P4 first, then P1/P2. Two-player games assign them to P1/P2 in order. Connect or activate controllers before the match; controller hardware behavior depends on the device/browser.

Controls (change in Match setup or the pause menu; saved on the device):
- **Movement: Joystick · WASD · gamepad** — WASD/arrows, left-thumb floating joystick, or controller. Drag, Q/E or right stick rotate the camera.
- **Movement: Tap / click to move** — tap or click a spot to walk there; hold to steer toward your finger/cursor. Rotate with right-drag (mouse), two-finger drag (touch) or the on-screen ⟲ ⟳ buttons; pinch or wheel to zoom. Keyboard/gamepad still work and cancel the destination.
- **Camera: Separate** — you steer the camera (it eases behind you when idle; toggle in pause menu). **Camera: Follows your character** — the camera turns whenever your character turns.
- Wheel, `-`/`=` zoom; Esc/P pause.

Vision: walls are taller than characters, so anyone you have no line of sight to is hidden in the arena and on the minimap (frozen runners are always shown on the minimap). Everything is revealed when the round ends.

The maze minimap is explored independently by each player. This 3D version does not yet include the original maze replay codes, online lobbies, campaign, wardrobe, or music.

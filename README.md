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
- **Maze Dash:** explore a randomly generated compact or standard maze and reach the glowing exit. A small, slow monster begins following after a 12-second head start. If it catches a player, that player's run ends; other players can still escape or give up independently.

Local play supports 1–4 players on one device, with separate views and independent line of sight. Choose each player's controls and screen position in setup or pause. Freeze Tag also lets players choose different sides. P1 uses WASD and P2 uses arrows; P3/P4 use touch or controllers. In 3–4-player games, the first controllers are assigned to P3/P4 first, then P1/P2. Two-player games assign them to P1/P2 in order. Connect or activate controllers before the match; controller hardware behavior depends on the device/browser.

The title screen is a Boomerang-Fu-style home: a slanted, torn-edged band holds a live 3D park scene (`docs/js/title-scene.js`) where a red seeker chases the roster characters, tags one into an ice block and a friend thaws her, while another kid stays frozen. It uses its own renderer (pixel ratio capped at 1.5), renders only while the home screen is visible, shows a still frame with `prefers-reduced-motion`, and falls back to a CSS gradient if the model or WebGL is unavailable. Menu: **Quick play** (random mode and match options using the current player count), **Start** (match setup, `#custom-play`), **Characters** (opens setup with the character studio), **Options** (audio settings) and **Credits**. Other menu cards share the same cream/teal/orange look. Standard gamepads can navigate menus with the left stick or D-pad, select with A, go back with B or Start, and change settings with left/right. Start pauses a match; the pause menu includes individual give-up buttons in Maze Dash.

**Settings** provides independent music and effects volume sliders, saved on the device. Character reactions are synthesized along with other effects. Some browsers require a screen tap or keyboard press to enable audio, even when using a controller.

**Audio** is fully procedural (Web Audio, no audio files): `docs/js/music.js` generates and sequences the music themes (menu, results, and one per mode: freeze, tag, outbreak, maze) with a lookahead scheduler, and extra layers fade in as the chase gets closer, time runs low or runners get frozen. `docs/js/sfx.js` owns the music/effects buses, stingers and layered game sounds (distance-based for the local player), and `docs/js/ui-sounds.js` adds menu hover/click/slider sounds. Music ducks and muffles while paused, and sound pauses when the tab is hidden.

Open **Character studio** in match setup to choose from hairstyles and hats, tops, pants, shorts or a skirt, and colors for skin, hair, clothes, shoes and accents. Each local player's look is saved on the device and stays the same when their role changes. Existing saved looks retain their colors and hair.

Character studio offers ten named presets (girls Mia, Zoe, Luna, Ruby; boys Max, Leo, Finn, Kai, Theo, Jay; `docs/js/roster.js`), **My character** (fully editable) and **Classic** (the simple procedural look). A preset has a fixed look; **Edit a copy** copies it into My character. All but Classic use the supplied animated model (idle, walking, running, tag, alert, recovery and celebration animations). Editable: skin, shirt, pants, shoe, hair and accent colors, hairstyles and hats (afro, mohawk, braid), tops (hoodie, jacket, sweater, tank, striped, jersey), bottoms (pants, joggers, skirt) and accessories (glasses, sunglasses, headphones, backpack, scarf, wristbands, cape), all real garments that move with the animation. Old saved looks still load (old New character becomes My character, old custom becomes Classic). Every CPU uses the same model with a unique preset (extra CPUs become randomized 'Guest N' looks; presets chosen by humans are not reused). Seekers always wear red: the top and trims are tinted at runtime (`avatar.setSeeker`), also when a runner becomes a seeker. Names float above characters in view (`docs/js/nametag.js`) and appear in toasts and results. The model downloads when first needed. Code: `avatar-color.js`, `avatar-hair.js`, `avatar-clothes.js`, `avatar-accessories.js`, shared helpers in `outfit.js`.

Controls (change in Match setup or the pause menu; saved on the device):
- **Movement: Joystick · WASD · gamepad** — WASD/arrows, left-thumb floating joystick, or controller. Drag, Q/E or right stick rotate the camera.
- **Movement: Tap / click to move** — tap or click a spot to walk there. Hold a finger on the screen to keep moving in that direction relative to your character; lift it to stop. Rotate with right-drag (mouse), two-finger drag (touch) or the on-screen ⟲ ⟳ buttons; pinch or wheel to zoom. Keyboard/gamepad still work and cancel the destination.
- **Camera: Separate** — you steer the camera (it eases behind you when idle; toggle in pause menu). **Camera: Follows your character** — the camera turns whenever your character turns.
- Wheel, `-`/`=` zoom; Esc/P pause.

Vision: walls are taller than characters, so anyone you have no line of sight to is hidden in the arena and on the minimap (frozen runners are always shown on the minimap). Everything is revealed when the round ends.

The maze camera stays below wall height and moves in front of obstructing walls; its height and zoom are fixed during maze play. The maze minimap is explored independently by each player. This 3D version does not yet include the original maze replay codes, online lobbies, campaign, or original wardrobe.

# Ridge Racer Circuit

A top-down motorbike racing game that runs entirely in the browser — no build step, no dependencies.

## Play

Open `index.html` directly, or serve the folder with any static file server, e.g.:

```
python3 -m http.server 8080
```

then visit `http://localhost:8080`.

## Controls

| Action | Keys |
| --- | --- |
| Accelerate | `W` / `↑` |
| Brake / Reverse | `S` / `↓` |
| Steer | `A` `D` / `← →` |
| Handbrake | `Space` |
| Start / Restart | `Enter` or on-screen buttons |

Touch controls appear automatically on touch devices.

## How it works

- `js/track.js` — generates a procedural closed-loop circuit (a smoothed polar curve, so it never self-intersects), resampled at a fixed arc-length step, plus the rendering of the asphalt/curbs/start line.
- `js/bike.js` — bike physics (accel/brake/friction/off-track penalty) shared by the player and AI, AI waypoint-following, and lap/position tracking via a signed odometer along the track.
- `js/input.js` — keyboard + touch input state.
- `js/audio.js` — small procedural engine hum and countdown/finish beeps via the Web Audio API.
- `js/main.js` — game state machine (menu → countdown → race → results), camera, HUD, minimap, and the AI rubber-banding that keeps rivals close to the player.

Race 4 AI riders over 3 laps. Stay off the grass — it saps your top speed.

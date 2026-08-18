# Crankshaft and Rampy's Wreck-less Ramble

A 3D open-world driving toy (Three.js). Drive around a little city with traffic
lights, ramps, a giant robot, a fire engine, a flame lizard, and a freight
train that circles the town.

> ⚠️ The game uses ES modules (`import` / `export`), which browsers block when
> the page is opened directly from the file system (`file://`). **You must
> serve the folder over HTTP** to play it.

## Start the game from PowerShell

Run these commands in PowerShell to start the game:

```powershell
cd c:\xampp\htdocs\rampy
python -m http.server 8090
```

Then open `http://localhost:8090/` in your browser.

To stop the server, press `Ctrl+C` in the PowerShell window.

## Controls

- **W / ↑** — accelerate
- **S / ↓** — reverse / brake
- **A / ←, D / →** — steer
- **Mouse drag** — orbit the camera
- **Touch** — virtual joystick (bottom-left) on mobile

## Notes

- The world is a torus: driving off any edge wraps you around to the opposite
  side.
- No build step is required — the code runs directly in the browser.

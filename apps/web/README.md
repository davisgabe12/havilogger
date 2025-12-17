## Development
- Install deps: `npm install`
- Start dev: `npm run dev` (binds to 127.0.0.1, respects PORT/DEV_PORT or --port/-p, default 3000)
- If the port is busy, the script prints the PID and `kill <pid>` command to stop it.
- `.next/dev/lock` is cleared automatically each run so back-to-back starts work.
- To expose on your LAN, override host/port: `HOST=0.0.0.0 PORT=3000 npm run dev`

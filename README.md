# Black Ink Studios

Website and backend for Black Ink Studios, a 3D walkthrough and architectural visualization studio.

- Scroll-scrubbed video scenes (GSAP ScrollTrigger + Lenis)
- Login, signup and account pages
- Enquiry form with an admin dashboard
- Node.js + Express backend with SQLite

## Run locally

Requires Node.js 22.5 or newer.

```bash
npm install
npm start
```

Then open http://localhost:8080

On Windows you can also double-click `start-server.bat`.

The first account that signs up becomes the admin.

## Production

Set these environment variables:

- `NODE_ENV=production`
- `JWT_SECRET=<a long random string>`
- `PORT` (optional)

Serve it over HTTPS on a host that runs Node.

## Notes

- `data/` holds the SQLite database and session secret. It is git-ignored.
- The original 4K source clips live in `assets/video/` and are git-ignored. The web-optimised versions are in `assets/web/`.

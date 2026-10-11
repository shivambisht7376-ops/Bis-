# Black Ink Studios

Website and backend for Black Ink Studios, a 3D walkthrough and architectural visualization studio.

- Scroll-scrubbed video scenes (GSAP ScrollTrigger + Lenis)
- Login, signup and account pages
- Enquiry form with an admin dashboard
- Node.js + Express backend with Postgres (Neon)

## Run locally

Requires Node.js 22.9 or newer and a Postgres database (Neon free tier works).

Copy `.env.example` to `.env` and paste your Neon `DATABASE_URL` into it.

```bash
npm install
npm start
```

Then open http://localhost:8080

On Windows you can also double-click `start-server.bat`.

The first account that signs up becomes the admin.

## Production

Set these environment variables:

- `DATABASE_URL=<Neon connection string>`
- `NODE_ENV=production`
- `JWT_SECRET=<a long random string>`
- `PORT` (optional)

Serve it over HTTPS on a host that runs Node.

## Notes

- Tables are created automatically on first start.
- `.env` and `data/` are git-ignored. Never commit them.
- The original 4K source clips live in `assets/video/` and are git-ignored. The web-optimised versions are in `assets/web/`.

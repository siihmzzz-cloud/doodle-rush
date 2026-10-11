# DoodleRush

DoodleRush is a browser party game with a real Socket.IO room server and a companion Remotion promo composition.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

In another terminal:

```sh
npm run web
```

Open [http://localhost:5173](http://localhost:5173). Use a second browser or device to join with the room code. The server listens on port 3001 by default. If you change `PORT`, update the target in `vite.config.ts` too.

## Deploying the multiplayer game

The Vercel build includes the Socket.IO function at `api/socket-io.ts`; the production client connects to `/api/socket-io/socket.io` over WebSocket on the same domain. No `VITE_SOCKET_URL` is required. Enable Vercel Fluid Compute/WebSocket support for the project if it is not already enabled. Local development keeps using the standalone `npm run dev` server on port 3001 through Vite's `/socket.io` proxy.

The browser bundle has the Supabase project URL and anon-role key as public defaults in `src/supabase.ts`, so Vercel does not need those build variables to configure the client. The anon key is designed for browsers; row-level security in the SQL migration is the security boundary. Never put a service-role/secret key in frontend code or any `VITE_` variable.

Room state currently lives in function memory. Vercel may route separate players or reconnects to different function instances, and WebSocket functions have a maximum connection lifetime, so this is suitable for a small beta but not durable multiplayer at scale. Use a shared room store and Socket.IO adapter (for example Redis) before relying on cross-instance rooms or long matches. Vercel's WebSocket support is in public beta; see [Vercel's announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta) and [connection/state guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).

## What works

- Guest name and avatar saved in browser storage.
- Live rooms with short join codes, capacity and host settings.
- Host-controlled rounds and timers, category selection, and deterministic drawer rotation.
- Mouse and touch drawing on normalized shared canvas strokes.
- Guess feed, private secret word for the drawer, early/late guess scoring, and duplicate-score prevention.
- Round reveal, live totals, match winner, and return home.
- Public lobby discovery, invite-only/open room control, and online player counts.
- Host review of near-miss guesses after each round, with a server-validated +50 point award.
- Pointer-reactive hero artwork with keyboard and reduced-motion support.
- Supabase-backed guest profiles, cosmetic catalog, secure shop purchases, inventory, and equipment.
- Remotion Studio promo composition in `promo/`.

## Commands

```sh
npm run build       # Type-check server and client; build the web client
npm test            # Run game-rule unit tests
npm --prefix promo run dev   # Open the Remotion Studio preview
npm --prefix promo run lint  # Lint and type-check the promo composition
```

## Architecture

- `src/` contains the React/Vite client and responsive design system.
- `server/index.ts` owns room membership, rounds, secret words, scores, and countdown timers through Socket.IO.
- `shared/game.ts` contains shared game types and deterministic rules.
- `server/game.test.ts` covers category selection, guess normalization, and scoring helpers.
- `promo/src/Root.tsx` contains the editable Remotion promo.

The game server is authoritative for room state and match scores. It validates the connected socket against the room member for host, drawing, guess, and near-miss bonus actions, and it broadcasts only the secret-word length to guessers before round completion. Open lobbies are listed from the live server process.

## Supabase setup

`src/supabase.ts` accepts Vite overrides and includes this project's public URL and anon-role key as browser-safe defaults, so the Vercel build does not rely on ignored `.env.local` files. The browser key is public and protected by the included RLS policies; never put a service/secret key in a `VITE_` variable.

Run `supabase/migrations/202610110001_shop.sql` in the Supabase SQL Editor. Enable anonymous sign-ins under Authentication → Providers so guest profiles can be created. The migration seeds the catalog and creates purchase/equip RPCs that check the authenticated guest and debit the wallet atomically.

Match scores and host bonuses are authoritative within the live room. Persisting those earned points into the Supabase shop wallet additionally needs a Supabase server secret and an authenticated player identity linked to each Socket.IO member. The supplied anon key cannot safely grant persistent currency. The migration includes a service-role-only grant function; the game server does not yet call it, so the persistent shop wallet will start at zero until that server-side link is configured.

## Current limits

Active rooms and public lobby listings live in one server process and disappear when it restarts; multiple server instances need a shared Socket.IO adapter and room store. Guest identity is currently browser-local for game rooms; anonymous Supabase identity is used for the persistent shop profile. There is no reconnect grace period, moderation, achievements, sound, PWA packaging, or native iOS/Android build. Difficulty is a lobby setting only, and the starter word packs are small and English-only. Production deployment needs persistent room state, verified identities, server-only point grants, rate limiting, and operational monitoring.

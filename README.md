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

The Vercel build serves the Vite frontend; `server/index.ts` is a separate Socket.IO process and is not started by that static deployment. Deploy the Node server on a host that keeps a process running (for example, Render, Railway, or Fly.io), configure its `PORT` if required, then add `VITE_SOCKET_URL` to the Vercel project's Environment Variables. Set it to the backend's public origin, such as `https://your-game-server.example.com` (no `/socket.io` suffix), and redeploy the frontend so Vite includes the value in its build. Leave this variable blank for local development.

Rooms and open-lobby listings are kept in the server process's memory, so this setup expects one backend instance and active rooms are lost when it restarts. For multiple server instances, add shared room storage and a Socket.IO adapter. Vercel Functions have a WebSocket/Socket.IO option in public beta, but require a dedicated function route and websocket-specific client configuration; this project does not currently include that route.

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

`src/supabase.ts` reads the public URL and anon/publishable key from Vite variables. The supplied project values are configured locally in `.env.local`, which is ignored by Git. The browser key is public and protected by the included RLS policies; never put a service/secret key in a `VITE_` variable.

Run `supabase/migrations/202610110001_shop.sql` in the Supabase SQL Editor. Enable anonymous sign-ins under Authentication → Providers so guest profiles can be created. The migration seeds the catalog and creates purchase/equip RPCs that check the authenticated guest and debit the wallet atomically.

Match scores and host bonuses are authoritative within the live room. Persisting those earned points into the Supabase shop wallet additionally needs a Supabase server secret and an authenticated player identity linked to each Socket.IO member. The supplied anon key cannot safely grant persistent currency. The migration includes a service-role-only grant function; the game server does not yet call it, so the persistent shop wallet will start at zero until that server-side link is configured.

## Current limits

Active rooms and public lobby listings live in one server process and disappear when it restarts; multiple server instances need a shared Socket.IO adapter and room store. Guest identity is currently browser-local for game rooms; anonymous Supabase identity is used for the persistent shop profile. There is no reconnect grace period, moderation, achievements, sound, PWA packaging, or native iOS/Android build. Difficulty is a lobby setting only, and the starter word packs are small and English-only. Production deployment needs persistent room state, verified identities, server-only point grants, rate limiting, and operational monitoring.

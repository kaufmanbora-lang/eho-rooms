# EchoRoom

EchoRoom is a Discord-inspired voice room app for friend groups. It has a polished React interface, Socket.IO signaling, and real browser-to-browser WebRTC voice calls.

## Features

- Email/password registration and login with remembered browser sessions
- Real users only: no seeded friends, no fake online accounts
- Voice rooms with a hard limit of 10 people per room
- Real microphone audio through WebRTC
- Clean voice processing with browser noise suppression, echo cancellation, adaptive noise gate, and Opus high-bitrate audio
- Camera and screen-share video tracks with live tiles
- Voice activity bars that react to real audio levels
- Call volume boost for quiet remote voices
- Socket.IO signaling server for joining rooms and connecting peers
- Real room chat messages while users are joined to the same voice room
- Create private channels, switch between channels, and invite friends
- Search real online users by nickname and add them as friends
- Profile photo upload, status, and bio
- Invite links with `?channel=study` style deep links
- Mic mute, deafen, camera/screen state buttons, room chat, friend list, room capacity UI
- One Node service for both frontend and backend, ready for Render

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Register at least two accounts in separate browser profiles or devices, allow microphone access, add each other by nickname, and join the same channel.

## Production Build

```bash
npm install
npm run build
npm start
```

The app binds to `process.env.PORT`, which Render sets automatically.

In local development, account/channel data falls back to `server/data/store.json`. In production, set `DATABASE_URL` so EchoRoom stores accounts, passwords, sessions, friends, channels, invites, and messages in PostgreSQL. The included `render.yaml` creates a Render Postgres database and wires its `connectionString` into `DATABASE_URL`, so accounts survive deploys, restarts, and computer shutdowns.

## Render Deployment

1. Push this folder to a GitHub repository.
2. In Render, create a Blueprint from the repo.
3. Render will read `render.yaml`, create the web service, create `echoroom-db`, and set `DATABASE_URL`.
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

Render provides HTTPS, which browsers require for microphone, camera, and screen sharing outside localhost. After deployment, use the Render URL with your friends; the app runs on Render's server, so your own computer does not need to stay on.

The Blueprint uses a paid `basic-256mb` Postgres database because Render's free Postgres option is temporary. If you want to bring your own Neon/Supabase/Postgres database instead, remove the `databases:` block from `render.yaml` and set `DATABASE_URL` manually in Render.

## TURN For Reliable Calls

The app includes a public STUN server by default. For friends on strict school, office, mobile, or double-NAT networks, set these Render environment variables for a TURN server:

```bash
TURN_URL=turn:your-turn-host.example.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-password
```

Without TURN, many calls will work, but some networks may not connect audio.

# EchoRoom

EchoRoom is a Discord-inspired voice room app for friend groups. It has a polished React interface, Socket.IO signaling, and real browser-to-browser WebRTC voice calls.

## Features

- Email/password registration and login with remembered browser sessions
- Real users only: no seeded friends, no fake online accounts
- Voice rooms with a hard limit of 10 people per room
- Real microphone audio through WebRTC
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

By default, local account/channel data is stored in `server/data/store.json`. The included Render Blueprint sets `DATA_DIR=/var/data` and attaches a 1 GB persistent disk at `/var/data`, so accounts, profiles, friends, and channels survive service restarts. Render persistent disks may require a paid web service plan; if you remove the disk, the app still runs, but data can reset after redeploys.

## Render Deployment

1. Push this folder to a GitHub repository.
2. In Render, create a Blueprint from the repo, or create a Web Service manually.
3. If using the included Blueprint, Render will read `render.yaml`.
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

Render provides HTTPS, which browsers require for microphone, camera, and screen sharing outside localhost. After deployment, use the Render URL with your friends; the app runs on Render's server, so your own computer does not need to stay on.

## TURN For Reliable Calls

The app includes a public STUN server by default. For friends on strict school, office, mobile, or double-NAT networks, set these Render environment variables for a TURN server:

```bash
TURN_URL=turn:your-turn-host.example.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-password
```

Without TURN, many calls will work, but some networks may not connect audio.

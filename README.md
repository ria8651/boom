# boom

Video conferencing with end-to-end encryption, powered by LiveKit.

## Setup

### Environment

Copy `.env.example` to `.env` and fill in your values:

```
LIVEKIT_API_KEY=...        # From your LiveKit server config
LIVEKIT_API_SECRET=...     # From your LiveKit server config
LIVEKIT_URL=wss://...      # Your LiveKit server WebSocket URL
BOOM_PASSWORD=...          # Shared password for room access + E2EE
PORT=3000                  # Server port (default 3000)
```

### Development

```bash
# Install dependencies
npm install

# Start the backend (in one terminal)
npm run dev:server

# Start the frontend (in another terminal)
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the backend on port 3000.

### Production (Docker)

```bash
docker build -t boom .
docker run -p 3000:3000 --env-file .env boom
```

### Docker Compose

Add to your existing compose file alongside LiveKit:

```yaml
boom:
  build: .
  ports:
    - "3000:3000"
  environment:
    - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
    - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
    - LIVEKIT_URL=${LIVEKIT_URL}
    - BOOM_PASSWORD=${BOOM_PASSWORD}
```

## How it works

Users enter a display name, room name, and password. The server validates the password and issues a LiveKit JWT token. The client connects to the LiveKit room with E2E encryption using the password as the shared key — even the server cannot decrypt audio/video content.

## Future features

- **Recording** — server-side recording via LiveKit Egress API
- **Virtual backgrounds** — MediaProcessor pipeline for background blur/replacement
- **Breakout rooms** — multiple LiveKit rooms with a coordination layer
- **Hand raising** — participant metadata flag + UI indicator
- **Reactions/emoji** — data channel broadcast of ephemeral reaction events
- **Noise cancellation** — Krisp noise cancellation via LiveKit's audio processor
- **Whiteboard** — shared canvas via data channels (tldraw/excalidraw integration)
- **Participant list with roles** — metadata-driven role display + moderation controls
- **Mobile responsive layout** — responsive grid breakpoints, touch-friendly controls
- **Picture-in-picture** — Browser PiP API for the focused video track
- **Room list / lobby** — browse and join active rooms
- **Display name persistence** — remember name across sessions

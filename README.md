# Wendy Reception

AI receptionist platform for dental and chiropractic practices. Wendy answers calls, books appointments, and handles common patient questions — with demo surfaces for sales, prototyping, and live voice interaction.

**Live demo:** [dr-fort-vercel.vercel.app](https://dr-fort-vercel.vercel.app)

## Demo Surfaces

Static HTML demos under `public/src/` (served at `/src/*`):

| Surface | Path | Purpose |
|---------|------|---------|
| Hub | `/src/hub.html` | Demo landing page linking to all surfaces |
| Deck | `/src/deck.html` | Sales presentation with ROI and pricing |
| Prototype | `/src/index.html` | Interactive call-booking prototype |
| Live | `/src/live.html` | Browser voice demo (Vapi) |

The Next.js app at `/` links to these surfaces and exposes API routes.

## Stack

- **Next.js 14** (App Router) with **React 18** and **TypeScript 5**
- **Vitest** for unit tests (`npm test`)
- **YAML** configuration for routing, agents, and per-office settings

## Repository Layout

```
app/              Next.js App Router (pages + API routes)
src/wendy/        Core platform: agents, tools, models, privacy, edge runtime
config/           Routing, agent, and office configuration (YAML)
public/src/       Static demo HTML (hub, deck, prototype, live)
docker/           Edge and central Dockerfiles
tests/            Vitest test suites
```

## Getting Started

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # run Vitest
npm run typecheck
```

For local development with Ollama, see `docker-compose.yml`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design, model tiers, agent architecture, and implementation phases.

## License

See [LICENSE](./LICENSE).

# County Games

Three daily browser games built on every US county (~3,144 of them), with a hub that ties them together. Static + `localStorage`, no backend.

**Play:** hub `/` · Countle `/countle` · County Connections `/connections` · Warmer `/warmer`

- **Countle** — guess the mystery county from its six percentile stats (Wordle-style deduction).
- **County Connections** — find the four hidden groups among sixteen county cards (NYT-Connections-style).
- **Warmer** — hot/cold proximity: name any county and the US map floods with heat toward a hidden target.

Each is one fresh puzzle per day, identical for everyone (UTC date key), with streaks and a spoiler-free share grid.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · TypeScript. Game data ships as static JSON in `public/data/`; all state persists to `localStorage`. No server, no accounts.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm test         # vitest — engine unit tests
```

Game logic is pure and unit-tested under `src/lib/{countle,connections,warmer,hub}`; the UIs live under `src/components/`. The map games render the US county choropleth from `public/data/counties-albers-10m.json` via `d3-geo` + `topojson-client`.

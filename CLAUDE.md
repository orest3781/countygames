# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

County Wars is a collectible card game where every US county (~3,144) is a playable card. Two main systems:

1. **Game Frontend** (`src/`) — Next.js 16 + React 19 + Tailwind 4 single-page app. Cards are pulled from Supabase. State persists to localStorage.
2. **Content Pipeline** (`pipeline/`) — 5-stage ETL that ingests federal data, generates AI card art via ComfyUI, and writes enriched card data to Supabase.

## Build & Run Commands

```bash
# Game frontend
npm run dev              # Start Next.js dev server
npm run build            # Production build (also validates TypeScript)
npm run lint             # ESLint

# Content pipeline
npm run pipeline         # Full pipeline: start services, pre-flight checks, run all 5 stages
npm run pipeline:check   # Verify services/models/files without running
npm run pipeline:dashboard  # Start read-only monitoring dashboard (port 9555)

# Individual pipeline stages
npx tsx pipeline/stage-1-reference.ts   # Download satellite tiles + wiki + street view
npx tsx pipeline/stage-2-describe.ts    # Vision AI scene descriptions (Gemma 4)
python pipeline/stage-3-render.py       # ComfyUI card art generation
python pipeline/stage-3-render.py --follow  # Follow mode: render as descriptions arrive
npx tsx pipeline/stage-4-enrich.ts      # Flavor text + abilities + notable people
npx tsx pipeline/stage-5-export.ts      # Push to Supabase + CSV export

# Data source ingestion (run before pipeline stages)
npm run pipeline:all     # All 5 data sources + curation + stat computation
npx tsx pipeline/sources/05-usda-typology.ts  # USDA county typology
```

## Architecture

### Game Frontend (`src/`)

Single page at `src/app/page.tsx` with 4 game modes: map, pack, battle, quiz. Each mode renders via overlay components in `src/components/overlays/`.

- `src/lib/store.ts` — Game state (collection, coins, streak, pity counter) in localStorage under key `county-wars-v2`
- `src/lib/supabase.ts` — Supabase client, `CountyCard` type, pack opening logic with rarity pull rates
- `src/lib/battle.ts` — Question-based battle system, 6 stats (PWR/RES/POP/TER/CHA/CUL), rewards

### Content Pipeline (`pipeline/`)

5 stages, each is one script. All resume-safe (skip already-processed counties). Status tracked in `data/.status.json`.

```
Stage 1 (reference)  → data/satellite/, data/streetview/, data/wiki.json
Stage 2 (describe)   → data/descriptions.json, data/cards-meta.json
Stage 3 (render)     → data/card-art/{fips}.png
Stage 4 (enrich)     → data/enrichment.json
Stage 5 (export)     → Supabase cards table, data/export.csv
```

- `pipeline/config.ts` — Central config: Supabase client, region map (8 US regions), rarity moods, status tracking, JSON helpers, Ollama helpers
- Stage 3 is Python (ComfyUI API). All others are TypeScript run with `tsx`.
- `data/.pipeline-config.json` — Shared config exported by TypeScript, read by Python stage 3 (keeps REGION_MAP/RARITY_MOODS in sync)
- Dashboard at `pipeline/dashboard/server.ts` serves monitoring UI + compare viewer at `/compare`

### External Services

| Service | URL | Used By |
|---------|-----|---------|
| Supabase | from .env.local | All stages, frontend |
| Ollama | localhost:11434 | Stage 2 (gemma4:e4b), Stage 4 (qwen3:14b) |
| ComfyUI | localhost:8188 | Stage 3 (JuggernautXL Ragnarok v13) |
| Google Maps | from .env.local | Stage 1 (satellite + street view) |

### Supabase Tables

- `counties` — 3,144 rows: fips, name, state, coordinates, county_seat
- `cards` — Game card data: stats, rarity, ability, flavor text, art prompt
- `raw_census`, `raw_gdp`, `raw_health`, `raw_fema` — Federal data sources
- `raw_usda_typology` — County economic classification (farming, mining, etc.)

## Environment Variables (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
NEXT_PUBLIC_GOOGLE_API_KEY=<google maps/street view api key>
COMFYUI_DIR=<path to ComfyUI installation>  # defaults to A:/ComfyUI_Fresh
```

## Key Patterns

- **Pipeline JSON files are atomic** — written to `.tmp` then renamed (Windows-safe fallback)
- **Ollama calls use `think: false`** — Gemma 4 and Qwen 3 default to thinking mode which wastes tokens
- **Stage 3 has `--follow` mode** — polls for new descriptions every 30s, allowing parallel execution with Stage 2
- **FIPS codes are 5-digit zero-padded strings** — always handled as strings, never parsed as numbers
- **Pipeline stages gate completion on <5% failure rate** — prevents marking as done when most counties failed
- **`pipeline/` is excluded from tsconfig.json** — pipeline TypeScript runs via `tsx`, not the Next.js build

## Ollama Models Required

- `gemma4:e4b` — Vision model for Stage 2 (satellite image descriptions)
- `qwen3:14b` — Text model for Stage 4 (flavor text, notable person extraction)

# PLL Shot Tracker

Internal web app for tracking advanced PLL shot stats. Replaces the current manual workflow of running a Jupyter notebook → using a third-party shot location site → maintaining a spreadsheet → merging everything by hand.

## Stack

- **Frontend:** Vite + React, hosted on Vercel
- **Backend:** Vercel serverless functions (Node, TypeScript)
- **Auth:** Vercel password protection (single shared password for the team)
- **Persistence:** `localStorage` per `(game_id, tracker)`
- **Output:** CSV download → Slack drop → QC → Stats Master

## Two upstream data sources

| Source | What it provides | Auth |
|---|---|---|
| Champion Data REST API | Shot events, possession data, game metadata (most CSV columns) | HTTP Basic (`CHAMPION_DATA_USERNAME` / `CHAMPION_DATA_PASSWORD`) |
| PLL Stats GraphQL API | Rosters, headshots, dominant hand, position, nationality | API key |

Both are proxied through Vercel functions because credentials cannot ship to the browser.

## Repo layout

```
pll-tracker-vercel/
├── api/                          # Vercel serverless functions
│   ├── games/
│   │   ├── index.ts              # GET /api/games — list match IDs for a season
│   │   └── [matchId].ts          # GET /api/games/:matchId — shot events + game metadata
│   └── rosters/
│       └── [matchId].ts          # GET /api/rosters/:matchId — both teams' rosters
│
├── lib/                          # Shared backend utilities
│   ├── championData.ts           # Champion Data API client (HTTP Basic)
│   ├── pllStats.ts               # PLL Stats GraphQL client
│   ├── shotTransform.ts          # Champion Data response → shot row schema (the meat)
│   └── types.ts                  # Shared types (Shot, Player, Game)
│
├── src/                          # Frontend
│   ├── App.tsx                   # Main shot tracker (the component you've prototyped)
│   ├── components/               # Field, GoalPlanePicker, ArmAnglePicker, PlayerPicker
│   ├── lib/
│   │   ├── api.ts                # Frontend API client
│   │   ├── csv.ts                # CSV export → 73-column lean Stats Master format
│   │   └── storage.ts            # localStorage wrapper
│   └── main.tsx
│
├── transform/                    # Post-CSV transform script (separate from app)
│   ├── transform.py              # CLI: reads lean CSV, adds computed columns, writes Stats Master row
│   └── requirements.txt
│
├── scripts/
│   └── test-champion-data.ts     # Smoke test for the Champion Data integration
│
├── .env.example                  # Template env file
├── package.json
├── tsconfig.json
├── vercel.json                   # Routing + auth config
└── vite.config.ts
```

## First-time setup

1. Clone repo, `npm install`
2. Copy `.env.example` to `.env.local` and fill in credentials
3. **`npm run dev`** — Vite only (`PORT` unset → port **5173**). `/api/*` is proxied to `127.0.0.1:3000`; run `vercel dev` in another terminal if you need local APIs, or expect proxy errors.
4. **`npm run dev:vercel`** — full stack. Vercel injects `PORT` into Vite so the CLI gateway and the framework server stay in sync; **`vercel.json`** only SPA-fallbacks requests whose `Accept` header looks like HTML, so `/@vite/client` and `/src/*.tsx` still reach Vite (see rewrite `has` on `/`). Open **`http://localhost:3000`**. Override the API proxy target with `VERCEL_DEV_API_ORIGIN` if your CLI listens elsewhere.
5. `npm run smoke` to verify Champion Data and PLL Stats API both respond
6. Push to `main` → Vercel auto-deploys (after the project is connected)

## Deployment

Vercel project must have these env vars set:

- `CHAMPION_DATA_USERNAME`
- `CHAMPION_DATA_PASSWORD`
- `PLL_STATS_API_KEY`
- `TRACKER_PASSWORD` (for Vercel password protection)

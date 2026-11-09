# AL KABIR EST

Desktop construction estimation app: BOQ, quantity takeoff, unit rate buildup, overheads and profit, with per-country profiles (Lebanon first).

Plan: https://claude.ai/artifact/8WKV951XtgeoyMwXb3tmYP

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run rebuild:electron   # build the SQLite driver for Electron
npm run dev                # open the app
```

Build an installer: `npm run dist:win` (Windows) or `npm run dist:mac` (Mac).

## Tests

```bash
npm run rebuild:node       # build the SQLite driver for Node
npm test
```

## Layout

- `src/shared/calc.ts` — calculation engine (takeoff, unit rate buildup, markups, VAT) with exact decimals
- `src/main/db` — SQLite schema, migrations, Lebanon seed data, queries
- `src/main/index.ts` — Electron main process
- `src/renderer` — React interface

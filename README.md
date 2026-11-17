# Pallet Pack-Out

Works out pallet pack-outs for cases and die-cut corrugated sheets, and prints a one-page spec sheet.

- `engine/`: the calculation engine (TypeScript, no dependencies), with tests
- `app/`: the web app (React + Vite)
- `PLAN.md`: goals, decisions and phases

## Run it

Node 22 is installed in `~/.local/node`. Add it to your PATH for the session:

```bash
export PATH=~/.local/node/bin:$PATH
```

Then:

```bash
npm install        # first time only
npm run dev        # app at http://localhost:5173
npm test           # engine tests
npm run build      # production build in app/dist
```

Pallets, flutes and the current pack-out are saved in the browser for now. Phase 3 moves them to a hosted database.

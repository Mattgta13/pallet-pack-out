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

Pallets, flutes, trailers, the current pack-out, the logo and settings are saved in each browser on its own. To move them to another computer, use **Export data** in the top bar, then **Import data** on the other computer (import replaces what that browser had).

## Publish it (GitHub Pages)

`.github/workflows/pages.yml` tests, builds and publishes the app on every push to `main`. One-time setup:

1. Create an empty repository on GitHub (no README), e.g. `pallet-pack-out`.
2. Push this project to it:
   ```bash
   git remote add origin https://github.com/<your-username>/pallet-pack-out.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to finish (re-run it if it ran before step 3).

The app is then at `https://<your-username>.github.io/pallet-pack-out/`.

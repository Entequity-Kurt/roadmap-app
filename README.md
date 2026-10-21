# AP Matching Roadmap

Kanban and roadmap board. All board state is one JSON document in Postgres table `public.app_data` (`id = 1`). The Next.js route handlers under `app/api` read and write that row.

## Which database

Queries never name a database. They use `DATABASE_URL`.

The only connection string in this repo was `.env.local.example`, and it selected **`neondb`**:

```
postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

The host, user, and password in that string are placeholders. The database path is `neondb`, which is the database this project was configured to open. `DS_Kanban` does not appear in the source, the schema, or git history.

Both Neon databases are the same shape (one `public.app_data` row). Restore the **`neondb`** dump into local database `ds_kanban`. Before you restore, compare the two dumps:

```sql
SELECT id, updated_at, pg_column_size(data) AS bytes FROM app_data;
```

Load the dump whose row is the real board (later `updated_at`, or a `data` document much larger than the empty seed in `lib/schema.sql`). The running app uses whichever database `DATABASE_URL` names.

## Run on Mac Mini

Apple Silicon, macOS, Homebrew, Node already installed. No Docker.

Postgres listens on port **5432**. The app listens on port **3000**.

### 1. Install and start Postgres 17

```bash
brew install postgresql@17
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@17
```

`brew services` starts Postgres now and again at login. On Apple Silicon the tools live in `/opt/homebrew/opt/postgresql@17/bin`. A default Homebrew cluster uses your macOS username and trusts local connections, so the URL needs no password.

### 2. Create the database and restore the dump

```bash
createdb ds_kanban
pg_restore --no-owner --no-acl --dbname=ds_kanban /path/to/neondb.dump
```

`--no-owner --no-acl` skips Neon roles and grants that do not exist on the Mac. A Neon custom-format dump often still prints harmless errors (for example an unrecognized `neon` setting) and `pg_restore` exits 1. Check the table after that:

```bash
psql -d ds_kanban -c "SELECT id, updated_at, pg_column_size(data) FROM app_data;"
```

You want one row. If the dump is plain SQL from `pg_dump` (it starts with `--` comments, not a custom-format archive), restore it with:

```bash
psql -d ds_kanban -f /path/to/neondb.sql
```

`lib/schema.sql` is only for an empty database with no dump. Its seed insert does nothing when `id = 1` already exists.

### 3. Configure, install, build, start

```bash
cd /path/to/roadmap-app
cp .env.example .env
npm install
npm run build
npm start
```

`.env` (this is the file the server reads):

```
DATABASE_URL=postgresql://localhost:5432/ds_kanban
PORT=3000
```

`npm start` runs `next start`, a long-running Node server. It binds `0.0.0.0` and the port from `PORT`, otherwise **3000**. Open `http://localhost:3000`.

Edit a card, wait for “Saved”, then confirm the row changed:

```bash
psql -d ds_kanban -c "SELECT id, updated_at FROM app_data;"
```

### 4. Background service at login

`deploy/com.entequity.roadmap-app.plist` is a LaunchAgent template. It starts the production server when you log in, restarts it if it exits, and writes logs under `~/Library/Logs`.

launchd does not expand `~`. Replace `YOUR_USER` in the plist (repo path, `node`, and both log paths), then:

```bash
mkdir -p ~/Library/Logs
cp deploy/com.entequity.roadmap-app.plist ~/Library/LaunchAgents/
# edit ~/Library/LaunchAgents/com.entequity.roadmap-app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.entequity.roadmap-app.plist
```

Logs:

- `~/Library/Logs/roadmap-app.log`
- `~/Library/Logs/roadmap-app.err.log`

Stop it with:

```bash
launchctl bootout gui/$(id -u)/com.entequity.roadmap-app
```

Build the app once before loading the agent (`npm install` and `npm run build`). The agent runs `next start` and expects `.next/` and `.env` in the repo. Postgres stays up through `brew services`, separate from this plist.

### Other devices

These are optional. Nothing in this repo sets them up.

- **LAN.** The server binds all interfaces. From another device on the same network, open `http://<mac-mini-lan-ip>:3000`. The address is `ipconfig getifaddr en0` (or `en1`). If the macOS firewall is on, allow incoming connections for `node` on port 3000.
- **Tailscale.** Install Tailscale on the Mac Mini and on the other device, join the same tailnet, and open `http://<mac-mini-tailscale-ip>:3000`.
- **Cloudflare Tunnel.** Install `cloudflared` on the Mac Mini and point a tunnel at `http://127.0.0.1:3000` for a public hostname.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Local Postgres URL. Example: `postgresql://localhost:5432/ds_kanban` |
| `PORT` | no | HTTP port for `next start`. Default `3000` |

Copy `.env.example` to `.env`. `.env` is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run build` | Production build (`.next/`) |
| `npm start` | Long-running server, port 3000 unless `PORT` is set |
| `npm run dev` | Development server with reload |

## What stayed behind on Neon and Vercel

- The database driver is `postgres` (TCP to local Postgres). The old driver was `@neondatabase/serverless`, which speaks Neon's HTTP protocol.
- Neon compute, branching, the Neon SQL editor, and the Vercel project (preview URLs, Vercel env dashboard) have no process to run locally. Postgres via Homebrew and `next start` under launchd replace them.
- This repo has no `vercel.json`, no Edge runtime, and no Vercel analytics or image config.
- DM Sans and DM Mono still load from `fonts.googleapis.com` (`app/layout.tsx`). With no network, the browser uses its fallback fonts and the board still works.

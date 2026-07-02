# TeamGPT

Self-hosted, multi-user ChatGPT for teams. TeamGPT gives your team a shared
chat UI with per-user accounts, conversation history, and daily budgets — while
the real provider API keys stay in a separate [LLM gateway](../llm-gateway).

TeamGPT never talks to OpenAI/Anthropic/Gemini directly. It sends
OpenAI-compatible requests to the gateway using a single shared key; the gateway
handles providers, fallback, caching, and global cost tracking.

```
Browser ──▶ TeamGPT (auth, users, budgets, history) ──▶ LLM gateway ──▶ providers
```

## Features

- **Multi-user accounts** with `admin` / `member` roles and server-side sessions
  (httpOnly cookies, scrypt-hashed passwords — no external auth dependency).
- **Streaming chat** over Server-Sent Events, with saved per-user conversation
  history and automatic titles. Assistant replies render **Markdown** (code
  blocks with light syntax highlighting, lists, links…) and generation can be
  interrupted with a **Stop** button. The model can be switched mid-conversation.
- **Conversation tools**: search by title/content, a per-conversation **system
  prompt**, **regenerate** / edit-and-resend the last message, and **export** a
  thread to Markdown or JSON.
- **Per-user daily budgets** — cap requests/day and cost/day, reset at midnight
  UTC. Token usage is taken from the gateway when available (the gateway streams
  a final usage chunk), and estimated locally otherwise.
- **Admin dashboard** — create/edit/disable/delete users, set per-user limits
  and a per-user default model, and view usage plus the gateway's aggregate
  metrics.
- **Zero heavy dependencies** — Express + Node built-ins. Data is stored in
  atomic JSON files under `DATA_DIR` (no database to run).

## Requirements

- Node.js **20+**
- A running [LLM gateway](../llm-gateway) reachable at `GATEWAY_URL`

## Quick start

```bash
npm install
cp .env.example .env      # then edit it (see below)
npm start
```

Open http://localhost:4000 and sign in with the seed admin credentials
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). The seed admin is created only on the first
boot, when no users exist yet.

For development with auto-reload:

```bash
npm run dev
```

## Run with Docker

Bring up TeamGPT together with the LLM gateway (built from the sibling
`../llm-gateway` repo) in one command:

```bash
docker compose up --build
```

TeamGPT is served on http://localhost:4000 and talks to the gateway over the
internal Docker network, so no provider keys live in TeamGPT. Data persists in
the `teamgpt-data` named volume. Configure via a local `.env` (see below) — every
variable has a safe default, so it also boots with nothing configured (using the
gateway's mock provider).

To build and run just the TeamGPT image against an existing gateway:

```bash
docker build -t team-gpt .
docker run -p 4000:4000 -e GATEWAY_URL=http://your-gateway:8080 \
  -e GATEWAY_API_KEY=your-key -v teamgpt-data:/app/data team-gpt
```

## Configuration

All configuration is via environment variables (loaded from `.env` if present).

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port. |
| `DATA_DIR` | `./data` | Directory for JSON data (users, sessions, conversations, usage). |
| `SESSION_TTL_HOURS` | `168` | Session lifetime in hours. |
| `COOKIE_SECURE` | `false` | Send the session cookie only over HTTPS (enable in production). |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed logins per IP+email before a temporary lockout. |
| `LOGIN_WINDOW_MINUTES` | `15` | Window in which failed attempts are counted. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | How long a key stays locked after hitting the limit. |
| `GATEWAY_URL` | `http://localhost:8080` | Base URL of the upstream LLM gateway. |
| `GATEWAY_API_KEY` | — | Shared key TeamGPT uses to call the gateway. |
| `DEFAULT_MODEL` | `gpt-4o-mini` | Model selected by default in the UI. |
| `AVAILABLE_MODELS` | `gpt-4o-mini,mock-gpt` | Comma-separated models users can pick. |
| `ADMIN_EMAIL` | `admin@example.com` | Seed admin email (first boot only). |
| `ADMIN_PASSWORD` | `change-me-now` | Seed admin password (first boot only). |
| `DEFAULT_DAILY_REQUESTS` | — | Default per-user daily request cap (blank = unlimited). |
| `DEFAULT_DAILY_COST_USD` | — | Default per-user daily cost cap (blank = unlimited). |

Per-user budget overrides are set from the admin dashboard and take precedence
over the defaults.

## HTTP API

Auth uses a `tg_session` httpOnly cookie set on login.

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{ email, password }` → sets session cookie. |
| `POST` | `/api/auth/logout` | Clears the session. |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` — self-service password change. |
| `GET` | `/api/auth/me` | Current user, effective budget, and UI config. |

### Conversations (member)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/conversations` | List conversations + today's usage/limits. Optional `?q=` filters by title/content; `?limit=&offset=` paginate (response includes `total`, `hasMore`). |
| `POST` | `/api/conversations` | Create a conversation `{ model, title, systemPrompt }`. |
| `GET` | `/api/conversations/:id` | Full conversation with messages. |
| `PATCH` | `/api/conversations/:id` | Update `{ title }`, `{ model }`, and/or `{ systemPrompt }`. |
| `DELETE` | `/api/conversations/:id` | Delete a conversation. |
| `POST` | `/api/conversations/:id/messages` | Send `{ content }`; streams the reply as SSE. |
| `POST` | `/api/conversations/:id/regenerate` | Regenerate the last reply; optional `{ content }` edits the last prompt first. Streams SSE. |

The message stream emits:

```
data: {"type":"delta","text":"..."}                    (repeated)
data: {"type":"done","conversationId":"...","usage":{...},"costUsd":0.0}
data: [DONE]
```

### Admin

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/users` | All users with limits + usage. |
| `POST` | `/api/admin/users` | Create a user (`{ email, name, password, role, budget, defaultModel }`). |
| `GET` | `/api/admin/users/:id` | One user with full usage. |
| `PATCH` | `/api/admin/users/:id` | Update name/role/password/budget/defaultModel/disabled. |
| `DELETE` | `/api/admin/users/:id` | Delete a user and their data. |
| `GET` | `/api/admin/gateway-metrics` | Proxy the gateway's aggregate metrics. |

Guards: the last active admin cannot be demoted or disabled, and admins cannot
delete their own account.

## Data & storage

Each concern owns one JSON file under `DATA_DIR`:

- `users.json` — accounts (with scrypt password hashes)
- `sessions.json` — active sessions (pruned lazily on access)
- `conversations.json` — per-user conversation history
- `usage.json` — per-user daily buckets, 30-day history, and all-time totals

Writes are atomic (temp file + rename), so a crash mid-write won't corrupt data.
Back up `DATA_DIR` to back up TeamGPT.

## Project layout

```
src/
  index.js            App wiring + server bootstrap
  config.js           Env loading and config
  middleware/auth.js  Session cookie parsing, requireAuth / requireAdmin
  routes/             auth, conversations, chat (SSE), admin
  services/           users, sessions, conversations, usage, cost, gateway, password
  store/jsonStore.js  Atomic JSON file store
public/
  index.html, app.js        Chat UI
  admin.html, admin.js      Admin dashboard
  style.css                 Shared styles
test/                       node:test suites
```

## Testing

```bash
npm test
```

Tests run on the built-in Node test runner. A preloaded `test/setup.js` points
the JSON stores at a throwaway temp directory, so tests never touch your real
`data/` folder or require a running gateway.

## Security notes

- Change `ADMIN_PASSWORD` before the first boot, and use a strong value.
- Passwords are hashed with scrypt; sessions are random 256-bit tokens stored
  server-side and sent as httpOnly cookies.
- Put TeamGPT behind HTTPS in production so session cookies aren't sent in the
  clear. Set `COOKIE_SECURE=true` so the cookie carries the `Secure` flag.
- The login endpoint is rate-limited per IP+email: after `LOGIN_MAX_ATTEMPTS`
  failures it locks that key for `LOGIN_LOCKOUT_MINUTES` (brute-force defense).
- Members can change their own password via `POST /api/auth/change-password`;
  doing so invalidates sessions on other devices.
- The `GATEWAY_API_KEY` grants access to the gateway — treat it as a secret and
  keep `.env` out of version control (it already is via `.gitignore`).

## License

MIT

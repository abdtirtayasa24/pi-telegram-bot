# Setup Plan to Control **Pi Coding Agent** from a **Telegram Bot**

## 1. Recommended Architecture
Use a **Telegram Bot Gateway** that runs Pi in **RPC mode**, not by scraping the terminal UI.
```bash
Telegram App
   ↓
Telegram Bot API
   ↓
Bot Gateway Service
   ↓
Pi RPC Process
   ↓
Existing Pi session files / project workspace
```

**Why RPC mode**
Pi RPC mode exposes Pi over JSONL through stdin/stdout and is explicitly designed for custom UIs and integrations. It supports sending prompts, steering active runs, follow-up messages, session switching, model switching, session stats, command listing, and getting assistant output.

This is more reliable than controlling the native TUI through `tmux`, `screen`, or pseudo-terminal automation.

---

## 2. Core Feature Mapping
**Requirement: “Able to continue session from installed Pi CLI”**
Use Pi’s existing session storage.

Pi RPC mode supports session persistence by default, allows a custom `--session-dir`, and exposes `switch_session` for loading a specific session file. It also exposes `get_state`, which returns the active `sessionFile`, `sessionId`, `sessionName`, streaming status, and message counts.

Plan:
```bash
pi --mode rpc --session-dir ~/.pi/sessions
```

Then from the bot:
```json
{"type": "switch_session", "sessionPath": "/home/user/.pi/sessions/example.jsonl"}
```

The bot should also support:
```bash
/sessions        List known Pi session files
/use <id>        Switch to an existing session
/current         Show active session
/new             Start fresh session
/name <text>     Set Pi session display name
/stats           Show token/cost/context stats
```

Pi sessions are tree-structured and can be navigated or branched in Pi; the official site notes that sessions are stored as trees and can be continued from previous points.

Important operational rule: avoid opening the same session file in both native Pi TUI and the Telegram gateway at the same time. Treat one Pi process as the active owner of a session to avoid state conflicts.

---

**Requirement: “Able to give instructions just like within native Pi Code”**
Map Telegram messages to Pi RPC commands.

Pi RPC supports `prompt` for normal user messages, `steer` for instructions while Pi is already running, `follow_up` for queued messages after a run finishes, and `abort` to stop the current operation.

Recommended behavior:
```bash
User sends normal Telegram message
→ Bot sends Pi RPC prompt

Pi is currently streaming/running
→ Bot sends steer or follow_up depending on mode

User sends /abort
→ Bot sends abort

User sends /model
→ Bot sends get_available_models or set_model

User sends /commands
→ Bot sends get_commands
```

Native Pi behavior includes “press Enter to steer the current run” and “Alt+Enter to queue a follow-up”; the Telegram version can mirror this with `/steer` and `/followup` commands.

---

## 3. Bot Gateway Design
**Recommended stack**

Use **Node.js** / **TypeScript**, because Pi itself is a TypeScript/Node-based package and the RPC docs mention that Node/TypeScript integrations may use `AgentSession` directly, or spawn Pi as an RPC subprocess.

Two viable implementation options:
| Option                      | Description                                      | Recommendation                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------- |
| Spawn `pi --mode rpc`       | Bot communicates with Pi over stdin/stdout JSONL | Best MVP                           |
| Use Pi SDK / `AgentSession` | Direct integration inside Node app               | Better long-term, but more coupled |

For first version, use subprocess RPC. It keeps the bot separate from Pi internals and easier to debug.

---

## 4. Telegram Update Mode
**MVP: Long polling**
Use Telegram `getUpdates`.

Telegram supports two mutually exclusive methods for receiving bot updates: `getUpdates` polling or webhooks. Updates are stored until received, but not for more than 24 hours.

Long polling is best for a local machine because:
```bash
No public domain required
No HTTPS certificate required
Works behind NAT
Simpler to deploy on a laptop/server/Raspberry Pi
```

**Production: Webhook**
Use webhook only when you have a public HTTPS endpoint.

Telegram webhook requirements include HTTPS/TLS, supported ports such as 443, 80, 88, or 8443, and a reachable public server.

---

## 5. Securit
This setup gives Telegram control over a coding agent that can read/write files and run shell commands, so security must be strict.

Follow these rules:
**1. Allowlist Telegram users**
    - Store allowed Telegram user IDs.
    - Reject every unknown chat/user.
    - Do not rely only on bot obscurity.
**2. Never expose secrets**
    - Do not print bot token, LLM API keys, `.env`, SSH keys, or Pi config.
    - Keep `TELEGRAM_BOT_TOKEN` and provider keys in environment variables or a secret manager.
    - Avoid logging raw messages if they may include credentials.
**3. Per-project access control**
    - Configure allowed workspaces.
    - Example:
        ```bash
        /project my-api
        → maps to /home/user/work/my-api
        ```
    Do not allow arbitrary `cd /`.
**4. Command confirmation layer**
    - For risky instructions, ask for confirmation before forwarding to Pi.
    - Examples:
        * deleting files
        * force-pushing
        * modifying production configs
        * running deployment commands
        * reading sensitive directories
**5. Session ownership**
    - One Telegram user should own one active Pi process/session at a time.
    - For team usage, create separate Pi workers per authorized user.
**6. Audit log**
    - Log metadata:
        * timestamp
        * Telegram user ID
        * command type
        * session file
        * success/failure
    - Do not log full secrets or full code outputs by default.

This aligns with the provided engineering guidance to treat code and customer data as sensitive, avoid exposing secrets, and follow security best practices.

---

## 6. Bot Commands
Recommended Telegram command set:

```bash
/start
Show bot status and active Pi session.

/help
Show available commands.

/sessions
List existing Pi sessions.

/use <session_id>
Switch to an existing Pi session.

/new
Start a new Pi session.

/current
Show active project, session file, model, streaming status.

/prompt <message>
Send a normal instruction to Pi.

/steer <message>
Interrupt/steer current Pi run.

/followup <message>
Queue instruction after current Pi run finishes.

/abort
Abort current Pi operation.

/models
List available Pi models.

/model <provider/model>
Switch Pi model.

/thinking <off|minimal|low|medium|high|xhigh>
Set thinking level where supported.

/commands
List Pi extension commands, prompt templates, and skills.

/stats
Show token usage, cost, and context usage.

/export
Export current session to HTML.

/reload
Restart Pi RPC process while preserving session.
```
For better UX, normal Telegram text can automatically behave like `/prompt`.

---

## 7. Message Flow

**Normal prompt**
Telegram message:
```bash
"Fix failing tests"
```
Bot:
```json
{"type":"prompt","message":"Fix failing tests"}
```

Pi streams events back over stdout. The bot collects `message_update` events and periodically edits a Telegram message or sends chunked updates.

Pi RPC emits streamed events such as `agent_start`, `message_update`, `tool_execution_start`, `tool_execution_update`, and `agent_end`.

---

**Steering while Pi is running**
Telegram:
```bash
/steer Actually only fix the auth tests first
```
Bot:
```json
{"type":"steer","message":"Actually only fix the auth tests first"}
```

This mirrors native Pi’s steering behavior.

---

**Follow-up after Pi finishes**
Telegram:
```bash
/followup After that, update the README
```
Bot:
```json
{"type":"follow_up","message":"After that, update the README"}
```

---

**Continue existing session**
Telegram:
```bash
Telegram:
/sessions
```
Bot scans Pi session directory and returns:
```bash
1. auth-refactor — /home/user/.pi/sessions/auth-refactor.jsonl
2. payment-tests — /home/user/.pi/sessions/payment-tests.jsonl
```
User:
```bash
/use 1
```
Bot:
```json
{"type":"switch_session","sessionPath":"/home/user/.pi/sessions/auth-refactor.jsonl"}
```

---

## 8. Session Discovery Strategy
Implement a small session indexer.

Sources:
```bash
~/.pi/
~/.pi/sessions/
configured --session-dir
project-local Pi session folders, if used
```
For every `.jsonl` session file, extract:
```bash
file path
last modified time
session name if available
first user message preview
message count
project/workspace path if discoverable
```
Then expose this via `/sessions`.

The bot should not mutate session files directly unless Pi RPC is not running. Prefer Pi’s own `switch_session`, `set_session_name`, `get_state`, `get_messages`, and `get_session_stats`.

---

## 9. Pi Process Manager
Create a `PiWorker` abstraction:
```bash
PiWorker
- start()
- stop()
- restart()
- send(command)
- prompt(message)
- steer(message)
- followUp(message)
- switchSession(path)
- getState()
- getMessages()
- getStats()
```
Internally:
```json
spawn("pi", ["--mode", "rpc", "--session-dir", configuredSessionDir])
```
Handle:
```bash
stdout JSONL parser
stderr logger
process exit recovery
request/response correlation by id
event emitter for streaming output
timeout handling
backpressure
```
Important: Pi RPC uses strict JSONL framing with LF newline delimiters, and the docs specifically warn clients not to use generic line readers that split on Unicode separators.

---

## 10. Telegram Response Strategy
Telegram messages have practical size and UX limits, so do not forward every raw stream event immediately.

Use this pattern:
```bash
1. Send "Pi is working..."
2. Buffer streaming text/tool events.
3. Edit the same Telegram message every 1–3 seconds.
4. If message grows too long, send a new chunk.
5. On completion, send final answer + status.
```
Recommended formatting:
```bash
🧠 Thinking...
🔧 Running: npm test
✅ Done
❌ Failed
```
For tool output:
```bash
Show concise summaries by default.
Use /verbose on to stream more detail.
Use /lastlog to retrieve the latest full tool output path or summary.
```

---

## 11. File and Image Support
Pi RPC supports images in prompts using base64 image data and MIME type.

Telegram file handling plan:
```bash
User sends photo/document
→ Bot downloads file from Telegram
→ If image: convert to Pi RPC image payload
→ If text/code file: save to temporary workspace path and tell Pi where it is
```
Commands:
```bash
/attach
/upload
/analyze_image
```

For large files, the standard Telegram Bot API may be enough for MVP. Telegram also documents a local Bot API server option that can support larger downloads/uploads and local file paths.

---

## 12. Deployment Plan
**Local MVP**
```bash
Machine:
- Existing Pi CLI installed
- Node.js installed
- Telegram bot token
- LLM provider credentials already configured for Pi
```
Service layout:
```bash
pi-telegram-bot/
  src/
    index.ts
    telegram/
    pi/
    sessions/
    security/
    config.ts
  .env
  package.json
  systemd/
    pi-telegram-bot.service
```
Environment variables:
```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
PI_BIN=pi
PI_SESSION_DIR=/home/user/.pi/sessions
PI_WORKSPACE_ROOT=/home/user/work
PI_DEFAULT_PROVIDER=
PI_DEFAULT_MODEL=
LOG_LEVEL=info
```
Run manually:
```bash
npm run build
npm start
```
Run as service:
```bash
systemctl --user enable pi-telegram-bot
systemctl --user start pi-telegram-bot
```

---

## 13. Implementation Milestones

**Milestone 1 — Minimal working bot**
Deliverables:
```bash
/start
/help
normal message → Pi prompt
stream final Pi response back to Telegram
authorized user check
```
Acceptance test:
```bash
Send: "What project are you in?"
Receive a Pi response from the active workspace.
```

---

**Milestone 2 — Session continuation**
Deliverables:
```bash
/sessions
/use <session>
/current
/new
/name <name>
```
Acceptance test:
```bash
Create a session in native Pi.
Open Telegram.
Run /sessions.
Switch to that session.
Ask Pi to continue the previous task.
```

---

**Milestone 3 — Native-like control**
Deliverables:
```bash
/steer
/followup
/abort
/stats
/models
/model
/thinking
/commands
```
Acceptance test:
```bash
Start a long Pi task.
Send /steer with a new instruction.
Confirm Pi applies it.
Send /abort and confirm the active run stops.
```

---

**Milestone 4 — Production hardening**
Deliverables:
```bash
systemd service
structured logs
crash restart
session lock
workspace allowlist
confirmation for risky commands
```
Acceptance test:
```bash
Restart service.
Bot restores configuration.
Existing sessions remain available.
Unauthorized Telegram user is rejected.
```

---

**Milestone 5 — Attachments and exports**
Deliverables:
```bash
photo → Pi image prompt
document upload → workspace file
/export → Pi HTML export
```
Pi RPC supports `export_html`, including custom output paths.

---

**14. Risk Register**
| Risk                               |                      Impact | Mitigation                                 |
| ---------------------------------- | --------------------------: | ------------------------------------------ |
| Same session opened by TUI and bot | Corrupted/conflicting state | Use session lock; one active owner         |
| Bot token leaked                   |         Full bot compromise | Env secrets, no logs, rotate token         |
| Unauthorized Telegram access       |     Remote code/file access | Strict user allowlist                      |
| Long outputs exceed Telegram UX    |             Unreadable chat | Chunking, summaries, `/verbose`            |
| Pi process crashes                 |        Bot becomes unusable | Auto-restart worker, preserve session path |
| Risky shell commands               |                   Data loss | Confirmation gates                         |
| Webhook networking complexity      |         Deployment friction | Start with polling                         |
| JSONL parsing bugs                 |      Broken stream handling | Use LF-only parser per Pi docs             |

---

**15. Final Recommended Build Path**
Start with this:
```bash
Node.js Telegram bot
+ long polling
+ spawned `pi --mode rpc`
+ same Pi session directory
+ Telegram allowlist
+ /sessions and /use
+ prompt/steer/followup/abort
+ systemd user service
```
Avoid this for MVP:
```bash
Controlling native Pi TUI through tmux
Public webhook
Multi-user shared Pi session
Direct session-file mutation
```
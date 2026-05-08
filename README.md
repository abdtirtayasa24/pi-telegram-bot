# Pi Telegram Bot

Telegram bridge for Pi Coding Agent that allows remote control of Pi sessions via Telegram bot commands.

## What It Does

This bot provides a complete gateway between Telegram and the Pi Coding Agent, allowing you to:

- Control Pi remotely via Telegram messages
- Send follow-up prompts while Pi is streaming  
- Manage Pi sessions (create, list, switch, name sessions)
- Run authorized commands with secure access control
- Receive complete responses from Pi in your Telegram chat

## Setup

1. **Install Dependencies**
   - Node.js v20+ required
   - Pi Coding Agent installed and in PATH (https://pi.ai)

2. **Configure Telegram Bot**
   - Talk to @BotFather on Telegram to create a bot and obtain token
   - Note your Telegram user ID (can use @userinfobot)

3. **Environment Setup**
   - Copy `.env.example` to `.env` and fill in values
   - Set TELEGRAM_BOT_TOKEN to your bot token
   - Add your authorized TELEGRAM_ALLOWED_USER_IDS
   - Verify pi is in PATH or configure PI_BIN

4. **Run the Bot**
   ```bash
   npm install
   npm start
   ```

## Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Your Telegram bot token from @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | (required) | Comma-separated list of authorized user IDs |
| `PI_BIN` | `pi` | Path to Pi executable |
| `PI_SESSION_DIR` | `~/.pi/sessions` | Directory for Pi session files |
| `PI_WORKDIR` | `process.cwd()` | Working directory for Pi subprocess |
| `POLL_TIMEOUT_SECONDS` | `25` | Telegram long poll timeout |
| `LOG_LEVEL` | `info` | Logging verbosity |

## Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Show welcome message |
| `/help` | Display list of available commands |
| `/sessions` | List available Pi sessions in directory |
| `/use <id>` | Switch to an existing session |
| `/new` | Create a fresh Pi session |
| `/name <text>` | Set name for current session (max 80 chars) |
| `/current` | Show info about active session |

## How It Works

The bot maintains one active Pi session that is shared by all authorized users. Normal text messages are sent as prompts to Pi, with follow-up support when Pi is already processing. Responses are buffered and delivered back to the appropriate user once completion is detected.
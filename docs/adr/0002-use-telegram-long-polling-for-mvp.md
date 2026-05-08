# Use Telegram long polling for the MVP

The Bot Gateway will receive Telegram updates with long polling instead of webhooks for the MVP. This allows the bot to run on a local machine without a public HTTPS endpoint, at the cost of webhook-style delivery latency and needing the process to keep polling.

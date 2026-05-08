# Use one active Pi Session for the MVP

The Bot Gateway will control one active Pi Session at a time for the MVP, shared by all Authorized Telegram Users. This keeps session switching and Pi subprocess ownership simple while deferring per-user Pi workers and concurrent session isolation to a later milestone.

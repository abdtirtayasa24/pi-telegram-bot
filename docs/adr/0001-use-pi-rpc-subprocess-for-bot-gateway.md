# Use Pi RPC subprocess for the Bot Gateway

The Bot Gateway will control Pi by spawning `pi --mode rpc` and communicating over LF-delimited JSONL instead of embedding Pi through the Node SDK. This keeps the Telegram integration decoupled from Pi internals for the MVP, at the cost of managing subprocess lifecycle, JSONL framing, and event buffering in our own code.

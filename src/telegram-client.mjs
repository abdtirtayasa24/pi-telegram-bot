// Telegram client module stub for dependency injection
// Will be implemented in issue #2

class TelegramClient {
  constructor(config) {
    this.config = config;
  }

  async start() {
    // Will implement long polling in issue #2
    console.log('Telegram client started (stub for dependency injection)');
  }

  async stop() {
    // Will implement stopping in issue #2
    console.log('Telegram client stopped (stub for dependency injection)');
  }
}

export default TelegramClient;
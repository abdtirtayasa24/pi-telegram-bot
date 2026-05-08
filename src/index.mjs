#!/usr/bin/env node

import { loadConfig } from './config.mjs';
import { createBotGateway } from './gateway.mjs';
import TelegramClient from './telegram-client.mjs';
import PiClient from './pi-client.mjs';
import SessionsManager from './sessions.mjs';

async function main() {
  // Load config
  const config = loadConfig();
  
  console.log('Starting Pi Telegram Bot Gateway...');
  
  // Create Pi client
  const piClient = new PiClient(config);

  // Create Telegram client
  const telegramClient = new TelegramClient(config);
  
  // Create session management manager
  const sessionManager = new SessionsManager(config);
  
  // Create clock utility (will be implemented in future issues)
  const clock = {};
  
  // Create bot gateway
  const gateway = await createBotGateway({
    config,
    telegram: telegramClient,
    pi: piClient,
    sessions: sessionManager,
    clock
  });
  
  // Start Pi client first
  await piClient.start();
  console.log('Pi client connected');
  
  // Pass the gateway handleUpdate method to the Telegram client
  await telegramClient.start(gateway.handleUpdate.bind(gateway));
  console.log('Telegram bot now polling...');
  
  // Handle graceful shutdown
  let shuttingDown = false;
  
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    
    console.log('\nShutting down gracefully...');
    
    try {
      await telegramClient.stop();
      console.log('Telegram client stopped');
    } catch (e) {
      console.error('Error stopping Telegram client:', e);
    }
    
    try {
      await piClient.close();
      console.log('Pi client disconnected');
    } catch (e) {
      console.error('Error stopping Pi client:', e);
    }
    
    try {
      await gateway.stop();
      console.log('Gateway shut down');
    } catch (e) {
      console.error('Error stopping gateway:', e);
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', reason, promise);
    shutdown();
  });
}

main().catch(err => {
  console.error('Application error:', err);
  process.exit(1);
});
import { homedir } from 'os';
import { join } from 'path';

/**
 * Load configuration from environment variables
 */
export function loadConfig() {
  // Required variables
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!telegramBotToken) {
    throw new Error('Configuration validation failed: TELEGRAM_BOT_TOKEN is required');
  }
  
  // Check if using placeholder value from example
  if (telegramBotToken === '123456:replace-me' || telegramBotToken.endsWith(':replace-me')) {
    throw new Error('Configuration validation failed: TELEGRAM_BOT_TOKEN still uses placeholder value from .env.example');
  }
  
  const telegramAllowedUserIdsRaw = process.env.TELEGRAM_ALLOWED_USER_IDS?.trim();
  if (!telegramAllowedUserIdsRaw) {
    throw new Error('Configuration validation failed: TELEGRAM_ALLOWED_USER_IDS is required');
  }
  
  // Parse user IDs as integers
  const userIdStrings = telegramAllowedUserIdsRaw.split(',').map(id => id.trim()).filter(id => id);
  if (userIdStrings.length === 0) {
    throw new Error('Configuration validation failed: TELEGRAM_ALLOWED_USER_IDS must contain at least one valid numeric ID');
  }
  
  const telegramAllowedUserIds = userIdStrings.map(userIdStr => {
    const userIdNum = parseInt(userIdStr, 10);
    if (isNaN(userIdNum)) {
      throw new Error(`Configuration validation failed: TELEGRAM_ALLOWED_USER_IDS must contain only valid numeric IDs, got: ${userIdStr}`);
    }
    return userIdNum;
  });
  
  // Optional variables with defaults
  const piBin = process.env.PI_BIN?.trim() || 'pi';
  const piSessionDir = process.env.PI_SESSION_DIR?.trim() || 
    join(homedir(), '.pi', 'sessions');
  const piWorkdir = process.env.PI_WORKDIR?.trim() || process.cwd();
  const pollTimeoutSeconds = parseInt(process.env.POLL_TIMEOUT_SECONDS) || 25;
  const logLevel = process.env.LOG_LEVEL?.trim() || 'info';
  
  return {
    telegramBotToken,
    telegramAllowedUserIds,
    piBin,
    piSessionDir,
    piWorkdir,
    pollTimeoutSeconds,
    logLevel
  };
}

export default { loadConfig };
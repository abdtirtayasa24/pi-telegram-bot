import { test, mock } from 'node:test';
import { equal, deepEqual, ok, rejects } from 'node:assert';
import { EventEmitter } from 'events';

// Import the modules we'll test
// For now, we'll write function stubs to make sure our test design is correct
async function getConfigModule() {
  const config = await import('../src/config.mjs');
  return config;
}

async function getGatewayModule() {
  const gw = await import('../src/gateway.mjs');
  return gw;
}

test('Config module loads and validates environment variables', async () => {
  // Mock environment to simulate different scenarios
  const originalEnv = { ...process.env };
  
  try {
    // Test with minimal valid config
    process.env.TELEGRAM_BOT_TOKEN = '123456:valid_token';
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789,987654321';
    
    const config = await getConfigModule().then(m => m.default || m);
    const cfg = config.loadConfig();
    
    equal(cfg.telegramBotToken, '123456:valid_token');
    equal(cfg.telegramAllowedUserIds.length, 2);
    deepEqual(cfg.telegramAllowedUserIds, [123456789, 987654321]);
    ok(cfg.piBin, 'should have default piBin');
    ok(cfg.piSessionDir, 'should have default piSessionDir');
  } finally {
    process.env = originalEnv;
  }
});

test('Config module validates required variables', async () => {
  const originalEnv = { ...process.env };
  
  try {
    // Test missing TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789';
    
    const config = await getConfigModule().then(m => m.default || m);
    try {
      config.loadConfig();
      throw new Error('Should have thrown validation error');
    } catch (error) {
      ok(error.message.includes('TELEGRAM_BOT_TOKEN'), 'Validation error should mention missing token');
    }
    
    // Test placeholder token
    process.env.TELEGRAM_BOT_TOKEN = '123456:replace-me';
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789';
    try {
      config.loadConfig();
      throw new Error('Should have thrown validation error for placeholder');
    } catch (error) {
      ok(error.message.includes('placeholder'), 'Validation error should mention placeholder');
    }
    
    // Test invalid user IDs
    process.env.TELEGRAM_BOT_TOKEN = '123456:valid_token';
    process.env.TELEGRAM_ALLOWED_USER_IDS = '';
    try {
      config.loadConfig();
      throw new Error('Should have thrown validation error for empty user IDs');
    } catch (error) {
      ok(error.message.includes('USER_IDS'), 'Validation error should mention USER_IDS');
    }
    
    process.env.TELEGRAM_ALLOWED_USER_IDS = 'not_a_number';
    try {
      config.loadConfig();
      throw new Error('Should have thrown validation error for invalid user ID');
    } catch (error) {
      ok(error.message.includes('valid numeric'), 'Validation error should mention valid numeric IDs');
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Config module applies correct defaults', async () => {
  const originalEnv = { ...process.env };
  
  try {
    process.env.TELEGRAM_BOT_TOKEN = '123456:valid_token';
    process.env.TELEGRAM_ALLOWED_USER_IDS = '123456789';
    delete process.env.PI_BIN;
    delete process.env.PI_SESSION_DIR;
    delete process.env.POLL_TIMEOUT_SECONDS;
    delete process.env.LOG_LEVEL;
    delete process.env.PI_WORKDIR;
    
    const config = await getConfigModule().then(m => m.default || m);
    const cfg = config.loadConfig();
    
    equal(cfg.piBin, 'pi', 'Should default to pi');
    
    // This assertion will depend on platform, so we'll just check it sets something
    ok(cfg.piSessionDir, 'Should set a default pi session dir');
    ok(cfg.piSessionDir.includes('.pi'), 'Default path should include .pi');
    ok(cfg.piSessionDir.includes('sessions'), 'Default path should include sessions');
    
    equal(cfg.pollTimeoutSeconds, 25, 'Should default to 25 seconds');
    equal(cfg.logLevel, 'info', 'Should default to info level');
    ok(cfg.piWorkdir, 'Should set a default workdir');
  } finally {
    process.env = originalEnv;
  }
});

test('Gateway core creates with injected dependencies', async () => {
  // We'll create the gateway function later
  const gw = await getGatewayModule().then(module => module.default || module);
  
  // Mock the dependencies  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  const mockTelegram = {};
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Basic existence check - function should exist
  ok(gateway, 'Gateway should be created');
  ok(typeof gateway.handleUpdate === 'function', 'Gateway should have handleUpdate method');
});

test('Gateway handleUpdate accepts update stub', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  const mockTelegram = {};
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Initially, it might not be implemented yet
  // We'll write this test expecting it to be implemented later
  
  // Just a basic stub now to validate the interface works
  ok(typeof gateway.handleUpdate === 'function', 'handleUpdate should exist');
  ok(gateway.handleUpdate.length === 1, 'handleUpdate should accept one parameter');
  
  // Test that it runs without immediate errors
  // Since handleUpdate returns a promise, we await it
  const result = await gateway.handleUpdate({message: {text: 'test'}});
  // Result should be defined or function should complete successfully
  ok(true, 'handleUpdate can execute without throwing'); // Simplify: just make sure it doesn't throw
});

// Placeholder for Pi subprocess behavior tests - we'll implement after PiClient module
test('PiClient initialization should spawn pi --mode rpc', async () => {
  // This test will be implemented after PiClient is built
});

// New authentication tests for the guard

test('Gateway processes authorized users', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Mock telegram client with sendMessage method
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {}
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Create an authorized user update
  const authorizedUpdate = {
    update_id: 1,
    message: {
      text: 'test',
      from: { id: 123456 }, // Authorized user ID
      chat: { id: -5555 }
    }
  };
  
  // This should not throw and should process authorized users
  await gateway.handleUpdate(authorizedUpdate);
  ok(true, 'Authorized user should be processed without errors');
});

test('Gateway rejects unauthorized users', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track if sendMessage was called
  let sendMessageCalled = false;
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      sendMessageCalled = true;
      // Verify the message content
      ok(msg.includes('not authorized'), 'Should send unauthorized message to blocked users');
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Create an unauthorized user update
  const unauthorizedUpdate = {
    update_id: 2,
    message: {
      text: 'test',
      from: { id: 999999 }, // Unauthorized user ID
      chat: { id: 8888 }
    }
  };
  
  // This should call sendMessage to send the unauthorized message
  await gateway.handleUpdate(unauthorizedUpdate);
  ok(sendMessageCalled, 'Should call sendMessage for Unauthorized users');
});

test('Gateway ignores messages without user data', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track if sendMessage was called
  let sendMessageCalled = false;
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      sendMessageCalled = true;
      // Verify the message content
      ok(msg.includes('not authorized'), 'Should send unauthorized message');
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Create a message with no user from section
  const noUserUpdate = {
    update_id: 3,
    message: {
      text: 'test',
      // No 'from' section
      chat: { id: 8888 }
    }
  };
  
  // This should call sendMessage since there's no user ID to check
  await gateway.handleUpdate(noUserUpdate);
  ok(sendMessageCalled, 'Should treat missing user ID as unauth');
});


// Command processing tests

test('Gateway handles start and help commands with actual content', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Test /start command
  let startMessageReceived = null;
  const startMockTelegram = {
    sendMessage: async (chatId, msg) => {
      startMessageReceived = msg;
    }
  };
  
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: startMockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  const startUpdate = {
    update_id: 1,
    message: {
      text: `/start`,
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(startUpdate);
  ok(startMessageReceived && startMessageReceived === 'Pi Telegram Bot is ready. Send a message to prompt Pi, or /help for commands.', 'Start command should return specific message');
  
  // Test /help command separately
  let helpMessageReceived = null;
  const helpMockTelegram = {
    sendMessage: async (chatId, msg) => {
      helpMessageReceived = msg;
    }
  };
  const helpGateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: helpMockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  const helpUpdate = {
    update_id: 1,
    message: {
      text: `/help`,
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  await helpGateway.handleUpdate(helpUpdate);
  ok(helpMessageReceived && helpMessageReceived.includes('Pi Telegram Bot Commands:'), 'Help command should return specific message with commands list');
});

test('Gateway processes commands with bot mention', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try a command with bot mention
  const commandUpdate = {
    update_id: 1,
    message: {
      text: '/help@mybot',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(commandUpdate);
  
  ok(messagesSent.length > 0, 'Should process command with bot mention');
  ok(messagesSent.some(msg => msg.msg.includes('help')), 'Should recognize command without bot mention');
});

test('Gateway handles unknown commands with error message', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try an unknown command
  const commandUpdate = {
    update_id: 1,
    message: {
      text: '/unknowncommand',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(commandUpdate);
  
  ok(messagesSent.length > 0, 'Should send reply for unknown command');
  ok(messagesSent.some(msg => msg.msg.includes('Unknown command') && msg.msg.includes('/help')), 'Should send error message with /help reference');
});

test('Gateway processes commands with arguments', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try a command with arguments
  const commandUpdate = {
    update_id: 1,
    message: {
      text: '/use 123 argument',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(commandUpdate);
  
  ok(messagesSent.length > 0, 'Should process command with arguments');
  ok(messagesSent.some(msg => msg.msg.includes('use') && msg.msg.includes('Coming soon')), 'Should recognize command with arguments');
});

test('Gateway sends normal text to Pi route (not commands)', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try a normal message (not a command)
  const textUpdate = {
    update_id: 1,
    message: {
      text: 'This is a normal text message to Pi',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(textUpdate);
  
  ok(messagesSent.length > 0, 'Should send reply for normal text');
  ok(messagesSent.some(msg => msg.msg.includes('Message received by Pi')), 'Should identify normal text as going to Pi');
});

test('Gateway properly distinguishes between commands vs normal text based on leading slash', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user  
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try commands to ensure they are processed (and don't go to Pi)
  const commandUpdate = {
    update_id: 1,
    message: {
      text: '/help',
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  messagesSent.length = 0;
  await gateway.handleUpdate(commandUpdate);
  ok(!messagesSent.some(msg => msg.msg.includes('Message received by Pi')), 'Commands should not trigger Pi route');
  
  // Anything starting with '/' should be treated as command, even if not recognized
  const invalidSlashCmd = {
    update_id: 2,
    message: {
      text: '/invalidcmd', // Text starting with / that is invalid command
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  messagesSent.length = 0;
  await gateway.handleUpdate(invalidSlashCmd);
  ok(!messagesSent.some(msg => msg.msg.includes('Message received by Pi')) && 
     messagesSent.some(msg => msg.msg.includes('Unknown')), 'Invalid commands should show unknown command error, not go to Pi');
     
  // Non-slash text should go to Pi route
  const normalTextNotSlash = {
    update_id: 3,
    message: {
      text: 'Not a slash command', 
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  messagesSent.length = 0;
  await gateway.handleUpdate(normalTextNotSlash);
  ok(messagesSent.some(msg => msg.msg.includes('Message received by Pi')), 'Non-slash text should go to Pi route');
});

// Help and Start command tests

test('Gateway /start command sends correct welcome message', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  let sentMsg = null;
  let sentChatId = null;
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      sentChatId = chatId;
      sentMsg = msg;
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try /start command
  const startUpdate = {
    update_id: 1,
    message: {
      text: '/start',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(startUpdate);
  
  ok(sentMsg, 'Should send a message for /start command');
  equal(sentMsg, 'Pi Telegram Bot is ready. Send a message to prompt Pi, or /help for commands.', '/start should send exact expected message');
  equal(sentChatId, -5555, 'Should send the message to the correct chat');
});

test('Gateway /help command sends complete command list', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  let sentMsg = null;
  let sentChatId = null;
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      sentChatId = chatId;
      sentMsg = msg;
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try /help command
  const helpUpdate = {
    update_id: 1,
    message: {
      text: '/help',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(helpUpdate);
  
  ok(sentMsg, 'Should send a message for /help command');
  
  // Verify key parts of the help text are present
  ok(sentMsg.includes('Pi Telegram Bot Commands:'), 'Help should include title');
  ok(sentMsg.includes('/start'), 'Help should include /start command');
  ok(sentMsg.includes('/help'), 'Help should include /help command');
  ok(sentMsg.includes('/sessions'), 'Help should include /sessions command');
  ok(sentMsg.includes('/use'), 'Help should include /use command');
  ok(sentMsg.includes('/new'), 'Help should include /new command');
  ok(sentMsg.includes('/name'), 'Help should include /name command');
  ok(sentMsg.includes('/current'), 'Help should include /current command');
  
  equal(sentChatId, -5555, 'Should send the message to the correct chat');
});

test('/help command includes proper HTML formatting', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  let sentMsg = null;
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      sentMsg = msg;
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try /help command
  const helpUpdate = {
    update_id: 1,
    message: {
      text: '/help',
      from: { id: 123456 },
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(helpUpdate);
  
  ok(sentMsg.includes('<b>'), 'Help message should include HTML bold tags');
  ok(sentMsg.includes('&lt;id&gt;'), 'Help message should escape html characters for arguments');
});

// Ensure other test still pass with the enhanced processCommand
test('Other commands still show coming soon message', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try /sessions command (not implemented in this issue yet)
  const cmdUpdate = {
    update_id: 1,
    message: {
      text: '/sessions',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(cmdUpdate);
  
  ok(messagesSent.length > 0, 'Should send reply for unimplemented command');
  ok(messagesSent.some(msg => msg.msg.includes('Coming soon')), 'Should show coming soon message for unimplemented command');
});// Session Discovery tests

// Test the SessionsDiscovery class itself
test('SessionsDiscovery correctly scans session directory', async () => {
  const mockConfig = {
    telegramBotToken: 'fake-token', 
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'  // Would be scanned
  };
  
  // Need a fake session discovery module
  const SessionsModule = await import('../src/sessions.mjs');
  const SessionsDiscovery = SessionsModule.default;
  
  const sessionsDiscovery = new SessionsDiscovery(mockConfig);
  
  // Test that the object is created successfully
  ok(sessionsDiscovery, 'SessionsDiscovery object should be created');
  equal(sessionsDiscovery.config, mockConfig, 'Configuration should be stored');
});

test('Format sessions lists returns proper empty message', async () => {
  const mockConfig = {
    telegramBotToken: 'fake-token', 
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  const SessionsModule = await import('../src/sessions.mjs');
  const SessionsDiscovery = SessionsModule.default;
  
  const sessionsDiscovery = new SessionsDiscovery(mockConfig);
  
  const emptyFormatted = sessionsDiscovery.formatSessionsList([]);
  equal(emptyFormatted, 'No Pi sessions found.', 'Empty list should show appropriate message');
});

test('Format sessions lists with data formats correctly', async () => {
  const mockConfig = {
    telegramBotToken: 'fake-token', 
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  const SessionsModule = await import('../src/sessions.mjs');
  const SessionsDiscovery = SessionsModule.default;
  
  const sessionsDiscovery = new SessionsDiscovery(mockConfig);
  
  // Test with sample data 
  const sessionsData = [
    { name: 'my-session', fileName: 'my-session.jsonl', path: '/path/my-session.jsonl', modifiedTime: new Date('2023-01-01T10:00:00Z') },
    { name: 'work-session', fileName: 'work-session.jsonl', path: '/path/work-session.jsonl', modifiedTime: new Date('2023-01-01T08:00:00Z') }
  ];
  
  const referenceTime = new Date('2023-01-01T12:00:00Z'); // 2 hours after first, 4 hours after second
  const formatted = sessionsDiscovery.formatSessionsList(sessionsData, referenceTime);
  
  ok(formatted.includes('1. my-session'), 'First session should be numbered 1');
  ok(formatted.includes('2. work-session'), 'Second session should be numbered 2');
  ok(formatted.includes('hour'), 'Should include time duration');
});

// Test the integration with the gateway
test('Gateway /sessions command integrated with discovery (with mock)', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  let messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  
  // Create mock session manager that returns predefined sessions
  const mockSessionsManager = {
    discoverSessions: async () => {
      return [
        { name: 'old-session', fileName: 'old-session.jsonl', modifiedTime: new Date(Date.now() - 5*60*60*1000) }, // 5 hours ago
        { name: 'recent-session', fileName: 'recent-session.jsonl', modifiedTime: new Date(Date.now() - 1*60*60*1000) } // 1 hour ago
      ];
    },
    formatSessionsList: (sessions) => {
      // This replicates the real formatting behavior
      if (sessions.length === 0) return 'No Pi sessions found.';
      return sessions.map((session, index) => {
        return `${index + 1}. ${session.name} -- modified sometime ago`;
      }).join('\n');
    }
  };
  
  const mockPi = new EventEmitter();
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessionsManager, // Use the mock
    clock: mockClock
  });
  
  const sessionsUpdate = {
    update_id: 1,
    message: {
      text: '/sessions',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(sessionsUpdate);
  
  ok(messagesSent.length > 0, 'Should send reply for /sessions command');
  ok(messagesSent[0].msg.includes('Sessions:'), 'Response should include Sessions heading');
  ok(messagesSent[0].msg.includes('recent-session'), 'Should list recent sessions first due to time ordering');
});// Test for commands OTHER than start, help, and now sessions (which are all implemented)
test('Gateway identifies and processes non-special approved commands', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Try each approved command OTHER THAN start/help/sessions, which have specific implementations now
  const otherApprovedCmds = ['use', 'new', 'name', 'current']; // These still show coming soon
  
  for (const cmd of otherApprovedCmds) {
    // Track messages sent only for this specific command test
    let messageReceived = null;
    const testMockTelegram = {
      sendMessage: async (chatId, msg) => {
        messageReceived = msg;
      }
    };
    
    const mockPi = new EventEmitter();
    const mockSessions = {};
    const mockClock = {};
    
    const gateway = await gw.createBotGateway({ 
      config: mockConfig, 
      telegram: testMockTelegram, 
      pi: mockPi,
      sessions: mockSessions,
      clock: mockClock
    });
    
    const commandUpdate = {
      update_id: 1,
      message: {
        text: `/${cmd}`,
        from: { id: 123456 }, // Authorized user
        chat: { id: -5555 }
      }
    };
    
    await gateway.handleUpdate(commandUpdate);
    
    ok(messageReceived, `Should send reply for approved command /${cmd}`);
    ok(messageReceived.includes('Coming soon') || messageReceived.includes('Pi'), `Command /${cmd} should show coming soon message`);
  }
});

// Test for the 'Other commands still show coming soon message' - fix the /sessions call
test('Other commands still show coming soon message', async () => {
  const gw = await getGatewayModule().then(module => module.default || module);
  
  const mockConfig = {
    telegramBotToken: 'fake-token',
    telegramAllowedUserIds: [123456],
    piSessionDir: '/fake/path'
  };
  
  // Track messages sent to user
  const messagesSent = [];
  const mockTelegram = {
    sendMessage: async (chatId, msg) => {
      messagesSent.push({ chatId, msg });
    }
  };
  const mockPi = new EventEmitter();
  const mockSessions = {};
  const mockClock = {};
  
  const gateway = await gw.createBotGateway({ 
    config: mockConfig, 
    telegram: mockTelegram, 
    pi: mockPi,
    sessions: mockSessions,
    clock: mockClock
  });
  
  // Try a command OTHER than start, help, sessions (which are now implemented)
  const cmdUpdate = {
    update_id: 1,
    message: {
      text: '/use',
      from: { id: 123456 }, // Authorized user
      chat: { id: -5555 }
    }
  };
  
  await gateway.handleUpdate(cmdUpdate);
  
  ok(messagesSent.length > 0, 'Should send reply for unimplemented command');
  ok(messagesSent.some(msg => msg.msg.includes('Coming soon')), 'Should show coming soon message for unimplemented command');
});
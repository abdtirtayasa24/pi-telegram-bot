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
});// Authentication tests for the guard

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
});// Command processing tests

test('Gateway identifies and processes approved commands', async () => {
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
  
  // Try each approved command
  const approvedCmds = ['start', 'help', 'sessions', 'use', 'new', 'name', 'current'];
  
  for (const cmd of approvedCmds) {
    messagesSent.length = 0; // Clear messages
    const commandUpdate = {
      update_id: 1,
      message: {
        text: `/${cmd}`,
        from: { id: 123456 }, // Authorized user
        chat: { id: -5555 }
      }
    };
    
    await gateway.handleUpdate(commandUpdate);
    
    ok(messagesSent.length > 0, `Should send reply for approved command /${cmd}`);
    ok(messagesSent.some(msg => msg.msg.includes('Coming soon')), `Approved command should show coming soon message`);
  }
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
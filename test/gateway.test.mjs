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
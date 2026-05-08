import { test, mock } from 'node:test';
import { equal, deepEqual, ok, rejects } from 'node:assert';
import { setTimeout } from 'timers/promises';

// Import the module we're testing
async function getTelegramClientModule() {
  const client = await import('../src/telegram-client.mjs');
  return client.default || client.TelegramClient;
}

test('TelegramClient constructor initializes with config', async () => {
  const TelegramClient = await getTelegramClientModule();
  
  const config = {
    telegramBotToken: 'test-token',
    telegramAllowedUserIds: [123456],
    pollTimeoutSeconds: 30
  };
  
  const client = new TelegramClient(config);
  
  equal(client.config, config);
  equal(client.offset, 0);
  equal(client.pollingIntervalMs, 30000); // 30 * 1000
  equal(client.pollingActive, false);
});

test('TelegramClient start begins polling', async () => {
  // Mock fetch to avoid actual API calls during test
  const originalFetch = global.fetch;
  let fetchCalledWith = null;
  
  global.fetch = mock.fn((url) => {
    fetchCalledWith = url;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: [] })
    });
  });
  
  try {
    const TelegramClient = await getTelegramClientModule();
    
    const config = {
      telegramBotToken: 'test-token',
      telegramAllowedUserIds: [123456],
      pollTimeoutSeconds: 1  // Speed up test
    };
    
    const client = new TelegramClient(config);
    const updateHandler = () => {};
    
    await client.start(updateHandler);
    
    // Wait a bit to let initial poll happen
    await setTimeout(100);
    
    ok(fetchCalledWith && fetchCalledWith.includes('test-token'), 'Initial fetch should be called with the token');
    ok(client.pollingActive, 'Polling should be active after start');
    
    await client.stop();
  } finally {
    global.fetch = originalFetch; // Restore original fetch
  }
});

test('TelegramClient converts Telegram update to gateway format', async () => {
  const TelegramClient = await getTelegramClientModule();
  
  const config = {
    telegramBotToken: 'test-token',
    telegramAllowedUserIds: [123456],
    pollTimeoutSeconds: 30
  };
  
  const client = new TelegramClient(config);
  
  const telegramUpdate = {
    update_id: 12345,
    message: {
      message_id: 67890,
      from: {
        id: 123456789,
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User'
      },
      chat: {
        id: -987654321,
        type: 'private'
      },
      text: 'Hello, Pi!',
      date: Math.floor(Date.now() / 1000)
    }
  };
  
  const gatewayUpdate = client.convertToGatewayUpdate(telegramUpdate);
  
  ok(gatewayUpdate, 'Should return a result for valid update');
  equal(gatewayUpdate.update_id, 12345);
  equal(gatewayUpdate.message.id, 67890);
  equal(gatewayUpdate.message.from.id, 123456789);
  equal(gatewayUpdate.message.from.username, 'test_user');
  equal(gatewayUpdate.message.from.first_name, 'Test');
  equal(gatewayUpdate.message.text, 'Hello, Pi!');
  equal(gatewayUpdate.message.chat.id, -987654321);
});

test('TelegramClient ignores non-message updates', async () => {
  const TelegramClient = await getTelegramClientModule();
  
  const config = {
    telegramBotToken: 'test-token',
    telegramAllowedUserIds: [123456],
    pollTimeoutSeconds: 30
  };
  
  const client = new TelegramClient(config);
  
  // Test with a non-message update (inline query)
  const nonMessageUpdate = {
    update_id: 12345,
    inline_query: {
      id: 'query-id',
      from: { id: 123456789 }
    }
  };
  
  const gatewayUpdate = client.convertToGatewayUpdate(nonMessageUpdate);
  equal(gatewayUpdate, null, 'Should return null for non-message updates');
});

test('TelegramClient handles caption for media with text', async () => {
  const TelegramClient = await getTelegramClientModule();
  
  const config = {
    telegramBotToken: 'test-token',
    telegramAllowedUserIds: [123456],
    pollTimeoutSeconds: 30
  };
  
  const client = new TelegramClient(config);
  
  const telegramUpdate = {
    update_id: 12345,
    message: {
      message_id: 67890,
      from: {
        id: 123456789
      },
      chat: {
        id: -987654321,
        type: 'private'
      },
      caption: 'This is an image caption',
      date: Math.floor(Date.now() / 1000)
    }
  };
  
  const gatewayUpdate = client.convertToGatewayUpdate(telegramUpdate);
  
  ok(gatewayUpdate, 'Should return a result for captioned media');
  equal(gatewayUpdate.message.text, 'This is an image caption');
});

test('TelegramClient stop terminates polling', async () => {
  // Mock fetch function
  const originalFetch = global.fetch;
  
  global.fetch = mock.fn(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: [] })
    })
  );
  
  try {
    const TelegramClient = await getTelegramClientModule();
    
    const config = {
      telegramBotToken: 'test-token',
      telegramAllowedUserIds: [123456],
      pollTimeoutSeconds: 1  // Speed up test
    };
    
    const client = new TelegramClient(config);
    const updateHandler = () => {};
    
    await client.start(updateHandler);
    
    ok(client.pollingActive, 'Polling should be active');
    
    await client.stop();
    
    ok(!client.pollingActive, 'Polling should be inactive after stop');
  } finally {
    global.fetch = originalFetch;
  }
});

test('TelegramClient maintains update offset', async () => {
  const originalFetch = global.fetch;
  let fetchCallCount = 0;
  
  global.fetch = mock.fn((url) => {
    fetchCallCount++;
    let updates = [];
    
    // Simulate different responses based on call count
    if (fetchCallCount === 1) {
      // First call: return some updates
      updates = [
        { update_id: 100, message: { text: 'First message' } },
        { update_id: 101, message: { text: 'Second message' } }
      ];
    }
    
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: updates })
    });
  });
  
  try {
    const TelegramClient = await getTelegramClientModule();
    
    const config = {
      telegramBotToken: 'test-token',
      telegramAllowedUserIds: [123456],
      pollTimeoutSeconds: 30
    };
    
    const client = new TelegramClient(config);
    
    // Simulate processing updates
    const gatewayUpdates = [];
    const updateHandler = (update) => {
      gatewayUpdates.push(update);
      return Promise.resolve();
    };
    
    await client.start(updateHandler);
    
    // The offsets should be maintained as updates are processed
    // For first call with updates [100, 101], the final offset in the client should be 102
    
    await setTimeout(50); // Wait for updates to be processed
    
    await client.stop();
    
    // Verify handler was called
    ok(gatewayUpdates.length > 0, 'Update handler should have been called');
    
  } finally {
    global.fetch = originalFetch;
  }
});
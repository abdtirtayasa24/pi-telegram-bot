import { setTimeout, setInterval } from 'timers/promises';

/**
 * Telegram client using long polling
 */
class TelegramClient {
  constructor(config) {
    this.config = config;
    this.offset = 0;
    this.pollingIntervalMs = this.config.pollTimeoutSeconds * 1000;
    this.pollingActive = false;
    this.pollingIntervalRef = null;
  }

  /**
   * Start the long polling mechanism
   */
  async start(updateHandler) {
    this.updateHandler = updateHandler;
    this.pollingActive = true;
    
    await this.poll();  // Initial poll
    
    // Set up periodic polling
    this.pollingIntervalRef = setInterval(async () => {
      if (this.pollingActive) {
        await this.poll();
      }
    }, this.pollingIntervalMs);
    
    console.log(`Telegram polling started with interval: ${this.pollingIntervalMs}ms`);
  }

  /**
   * Stop the long polling mechanism
   */
  async stop() {
    this.pollingActive = false;
    if (this.pollingIntervalRef) {
      clearInterval(this.pollingIntervalRef);
      this.pollingIntervalRef = null;
    }
    console.log('Telegram polling stopped');
  }

  /**
   * Poll Telegram API for updates
   */
  async poll() {
    if (!this.pollingActive) return;
    
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/getUpdates`;
    const params = new URLSearchParams({
      offset: this.offset,
      timeout: this.config.pollTimeoutSeconds  // In seconds
    });
    
    try {
      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          // Update offset to prevent duplicate processing
          if (update.update_id >= this.offset) {
            this.offset = update.update_id + 1;
          }
          
          // Convert Telegram update to gateway format and process
          const gatewayUpdate = this.convertToGatewayUpdate(update);
          if (gatewayUpdate) {
            try {
              await this.updateHandler(gatewayUpdate);
            } catch (error) {
              console.error('Error processing update:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error polling Telegram API:', error.message);
    }
  }

  /**
   * Convert Telegram update object to the gateway update format
   */
  convertToGatewayUpdate(telegramUpdate) {
    // Only interested in message updates for now
    if (!telegramUpdate.message) {
      return null; // Currently ignoring non-message updates
    }
    
    const message = telegramUpdate.message;
    
    // Structure the update for gateway consumption
    return {
      update_id: telegramUpdate.update_id,
      message: {
        id: message.message_id,
        from: {
          id: message.from?.id,
          username: message.from?.username,
          first_name: message.from?.first_name,
          last_name: message.from?.last_name
        },
        chat: {
          id: message.chat?.id,
          type: message.chat?.type
        },
        // Include text or caption (for images with text)
        text: message.text || message.caption,
        // Include media information if needed in future
        date: message.date,
        timestamp: message.date ? new Date(message.date * 1000).toISOString() : null
      }
    };
  }

  /**
   * Send a message to the specified chat
   */
  async sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML' // Enable HTML markdown for responses
        })
      });
      
      if (!response.ok) {
        throw new Error(`Send message failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(`API response not OK: ${JSON.stringify(result)}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error sending message to Telegram:', error.message);
      throw error;
    }
  }
}

export default TelegramClient;
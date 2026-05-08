/**
 * Create the Bot Gateway with injected dependencies
 */
export async function createBotGateway({ config, telegram, pi, sessions, clock }) {
  // Keep a queue of pending prompts (per chat or globally - to be refined later as needed)
  const pendingPrompts = [];

  return {
    /**
     * Handle an incoming Telegram update
     * @param {Object} update - The telegram update object
     */
    async handleUpdate(update) {
      // Return early if there's no message
      if (!update || !update.message) {
        return;
      }

      const userId = update.message.from?.id;
      const chatId = update.message.chat?.id;
      
      // Check if the user is authorized
      if (!userId || !config.telegramAllowedUserIds.includes(userId)) {
        // Send unauthorized message to the user - need to access telegram client
        if (telegram && typeof telegram.sendMessage === 'function') {
          await telegram.sendMessage(chatId, 'You are not authorized to use this bot.');
        } else {
          console.error('Unauthorized user attempted to use bot:', userId, 'Chat ID:', chatId);
        }
        // Return early, don't process the update further
        return;
      }

      // Now the user is authenticated
      console.log('Processing message from authorized user:', userId);
      
      const messageText = update.message.text?.trim();
      
      // If there's no text in the message, we have nothing to process
      if (!messageText) {
        return;
      }
      
      // Check if this is a command
      if (messageText.startsWith('/')) {
        await this.processCommand(chatId, messageText, userId);
        return; // Don't pass commands to other processing
      }
      
      // This is a normal message, which would go to Pi in later implementations
      console.log('Received normal message from authorized user (will go to Pi later):', messageText);
      
      // For now, we'll just send back an acknowledgment that the message is recognized
      // and will be processed in later issues
      if (telegram && typeof telegram.sendMessage === 'function') {
        await telegram.sendMessage(chatId, 'Message received by Pi. (Normal text routing implemented in issue #9)');
      }
    },
    
    /**
     * Process a command from an authorized user
     * @param {number} chatId - The chat identifier to send response to
     * @param {string} messageText - The command with arguments
     * @param {number} userId - The user who sent the command
     */
    async processCommand(chatId, messageText, userId) {
      // Extract command and arguments from the message
      const [commandPart, ...args] = messageText.split(' ');
      
      // Remove the '/' prefix
      let command = commandPart.substring(1);
      
      // Handle bot mention in command (e.g., /help@botname)
      const commandParts = command.split('@');
      command = commandParts[0]; // Only take the command part before '@'
      
      const commandLower = command.toLowerCase();
      
      // Approved commands according to issue #4
      const approvedCommands = new Set(['start', 'help', 'sessions', 'use', 'new', 'name', 'current']);
      
      // If command is not in the approved list, send unknown command message
      if (!approvedCommands.has(commandLower)) {
        if (telegram && typeof telegram.sendMessage === 'function') {
          await telegram.sendMessage(chatId, 'Unknown command. Send /help for available commands.');
        }
        return;
      }
      
      // Dispatch to specific command handlers (to be implemented in future issues)
      // For now, we'll respond saying the command handler is coming in future issues
      if (telegram && typeof telegram.sendMessage === 'function') {
        await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
      }
    },

    // Additional helper methods will be added here
    // For now, we just need the basic structure to match our tests
    
    /**
     * Stop the gateway
     */
    async stop() {
      console.log('Stopping Bot Gateway');
    }
  };
}

export default { createBotGateway };
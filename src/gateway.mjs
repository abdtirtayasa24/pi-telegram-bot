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
      
      // For now, we'll just log to indicate the function recognizes authorized users
      // Actual implementation will come as we build out features in following issues
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
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

      // Process the message (this will be extended as we implement more features)
      // This is the main interface that will grow as we add command processing, auth, etc.
      console.log('Processing update in gateway:', update);
      
      // For now, we'll just log to indicate the function exists and is callable
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
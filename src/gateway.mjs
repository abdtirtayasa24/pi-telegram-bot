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
      if (!userId || !config.telegramAllowedUserIds || !config.telegramAllowedUserIds.includes(userId)) {
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
      
      // Enhanced dispatcher with session naming and status integration
      switch (commandLower) {
        case 'start':
          if (telegram && typeof telegram.sendMessage === 'function') {
            await telegram.sendMessage(chatId, 'Pi Telegram Bot is ready. Send a message to prompt Pi, or /help for commands.');
          }
          break;
        case 'help':
          if (telegram && typeof telegram.sendMessage === 'function') {
            const helpText = [
              '<b>Pi Telegram Bot Commands:</b>',
              '',
              '<b>/start</b> - Display welcome message',
              '<b>/help</b> - Show this help message',
              '<b>/sessions</b> - List available Pi sessions',
              '<b>/use &lt;id&gt;</b> - Switch to an existing session',
              '<b>/new</b> - Create a new session',
              '<b>/name &lt;text&gt;</b> - Set the current session name',
              '<b>/current</b> - Show the active session info',
              ''
            ].join('\n');
            await telegram.sendMessage(chatId, helpText);
          }
          break;
        case 'sessions':  // Added for issue #6
          if (sessions && typeof sessions.discoverSessions === 'function') {  // sessions manager object with required methods
            try {
              const discoveredSessions = await sessions.discoverSessions();
              const formattedSessions = sessions.formatSessionsList(discoveredSessions);
              
              // Remember session list for this chat so /use can reference it
              sessions.rememberSessionListForChat(chatId, discoveredSessions);
              
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `<b>Sessions:</b>\n${formattedSessions}`);
              }
            } catch (error) {
              console.error('Error discovering sessions:', error);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, 'Error listing sessions. Please check logs.');
              }
            }
          } else {
            // Fall back to coming soon message for testing when sessions manager unavailable
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
            }
          }
          break;
        case 'use':  // Added for issue #7 - session switching
          if (sessions && typeof sessions.getSessionByIndex === 'function' && 
              pi && typeof pi.switchSession === 'function') {
            // Extract session ID from command arguments
            const args = messageText.split(' ').slice(1); // Get everything after command
            const sessionId = args[0];
            
            if (!sessionId) {
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, 'Please specify a session number. Usage: /use <number>')
              }
              break;
            }
            
            const sessionIndex = parseInt(sessionId, 10) - 1; // Convert to 0-based index
            if (isNaN(sessionIndex) || sessionIndex < 0) {
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Invalid session number: ${sessionId}`);
              }
              break;
            }
            
            // Get the session from the remembered list for this chat
            const selectedSession = sessions.getSessionByIndex(chatId, sessionIndex);
            if (!selectedSession) {
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Session ${sessionId} not found. Run /sessions first to see available sessions.`);
              }
              break;
            }
            
            // Validate the path to prevent traversal attacks
            if (!sessions.validateSessionPath(selectedSession.path)) {
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Invalid session path: ${selectedSession.path}`);
              }
              break;
            }
            
            // Try to switch to the selected session
            try {
              await pi.switchSession(selectedSession.path);
              sessions.setActiveSessionForChat(chatId, selectedSession.path);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Switched to Pi session: ${selectedSession.name}`);
              }
            } catch (error) {
              console.error('Error switching Pi session:', error);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Could not switch to session: ${error.message}`);
              }
            }
            
          } else {
            // Fallback if any dependencies are missing
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
            }
          }
          break;
        case 'new':  // Added for issue #7 - create new session
          if (pi && typeof pi.newSession === 'function') {
            try {
              await pi.newSession();
              if (sessions && typeof sessions.setActiveSessionForChat === 'function') {
                sessions.setActiveSessionForChat(chatId, null); // Clear active session since we started new
              }
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Created fresh Pi session. Ready to begin new work.`);
              }
            } catch (error) {
              console.error('Error creating new Pi session:', error);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Could not create new session: ${error.message}`);
              }
            }
          } else {
            // Fallback if dependencies are missing
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
            }
          }
          break;
        case 'name':  // Added for issue #8 - session naming
          if (pi && typeof pi.getState === 'function' && typeof pi.send === 'function') {
            const args = messageText.split(' ').slice(1); // Get everything after command
            const nameText = args.join(' ').trim();
            
            if (!nameText) {
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, 'Please specify a session name. Usage: /name <text>')
              }
              break;
            }
            
            // Trim to max 80 characters as per requirements
            let finalName = nameText;
            if (nameText.length > 80) {
              finalName = nameText.substring(0, 80);
              console.log(`Truncating session name from ${nameText.length} to 80 characters`);
            }
            
            try {
              // Send as set_session_name command to Pi
              await pi.send({ type: 'set_session_name', name: finalName });
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Session name updated to: ${finalName}`);
              }
            } catch (error) {
              console.error('Error setting session name:', error);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Could not set session name: ${error.message}`);
              }
            }
            
          } else {
            // Fallback if dependencies are missing
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
            }
          }
          break;
        case 'current':  // Added for issue #8 - session status
          if (pi && typeof pi.getState === 'function') {
            try {
              const state = await pi.getState();
              
              let displayName = 'unnamed';
              if (state.sessionName) {
                displayName = state.sessionName;
              } else if (state.sessionFile) {
                // Extract basename without path for privacy
                const pathParts = state.sessionFile.split(/[\\/]/);
                displayName = pathParts[pathParts.length - 1].replace(/\.jsonl$/, '');
              }
              
              // Format session status details
              const statusLines = [
                `<b>Current Pi Session:</b>`,
                `Name: ${displayName}`,
                `ID: ${state.sessionId || 'unknown'}`,
                `Streaming: ${state.isStreaming ? 'YES' : 'NO'}`,
                `Model: ${state.currentModel || 'default'}`,
                `Messages: ${state.messageCount || 0}`,
                `Last Active: ${(new Date(state.lastInteraction * 1000 || Date.now())).toLocaleString()}`
              ];
              
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, statusLines.join('\n'));
              }
            } catch (error) {
              console.error('Error getting session state:', error);
              if (telegram && typeof telegram.sendMessage === 'function') {
                await telegram.sendMessage(chatId, `Could not get session status: ${error.message}`);
              }
            }
          } else {
            // Fallback if dependencies are missing
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
            }
          }
          break;
        default:
          if (telegram && typeof telegram.sendMessage === 'function') {
            await telegram.sendMessage(chatId, `Command '${commandLower}' received. Coming soon in upcoming issues.`);
          }
          break;
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
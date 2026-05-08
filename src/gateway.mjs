/**
 * Create the Bot Gateway with injected dependencies for response routing
 */
export async function createBotGateway({ config, telegram, pi, sessions, clock }) {
  // Keep a queue of pending prompt jobs per chat with correlation information
  const pendingPromptJobs = new Map(); // Maps chatId -> array of pending job info with text buffer
  let nextRequestId = 1;
  let jobsById = new Map();  // Maps request ID -> job metadata for correlation
  let activeJobQueue = [];  // Queue of jobs corresponding to requests sent to Pi in order

  // Store references to be able to unsubscribe events when needed
  let onPiEvent = null;

  const addPendingJob = (chatId, requestId, originalMessage = '') => {
    const jobId = nextRequestId++;
    const job = {
      id: jobId,
      requestId,
      chatId,
      originalMessage,
      textBuffer: '',  // To collect response as it arrives
      timestamp: Date.now()
    };
    
    jobsById.set(jobId, job);
    
    // Add to chat-sorted collection
    if (!pendingPromptJobs.has(chatId)) {
      pendingPromptJobs.set(chatId, []);
    }
    pendingPromptJobs.get(chatId).push(job);
    
    // Also add to global active queue to track the order requests were sent
    activeJobQueue.push(job);
    
    return job;
  };

  const removePendingJob = (jobId) => {
    if (!jobsById.has(jobId)) return;
    
    const job = jobsById.get(jobId);
    const {chatId} = job;
    
    // Remove from jobs by ID
    jobsById.delete(jobId);
    
    // Remove from chat-sorted collection
    if (pendingPromptJobs.has(chatId)) {
      const jobs = pendingPromptJobs.get(chatId);
      const index = jobs.findIndex(j => j.id === jobId);
      if (index !== -1) {
        jobs.splice(index, 1);
      }
      if (jobs.length === 0) {
        pendingPromptJobs.delete(chatId);
      }
    }
    
    // Remove from active job queue too if present
    const queueIndex = activeJobQueue.findIndex(j => j.id === jobId);
    if (queueIndex !== -1) {
      activeJobQueue.splice(queueIndex, 1);
    }
  };

  const getJobsForChat = (chatId) => {
    return pendingPromptJobs.get(chatId) || [];
  };

  const clearChatJobs = (chatId) => {
    const jobs = pendingPromptJobs.get(chatId) || [];
    for (const job of jobs) {
      jobsById.delete(job.id);
      // Also remove from active queue
      const queueIndex = activeJobQueue.findIndex(j => j.id === job.id);
      if (queueIndex !== -1) {
        activeJobQueue.splice(queueIndex, 1);
      }
    }
    pendingPromptJobs.delete(chatId);
  };

  // Set up Pi event listeners when Pi client is available
  if (pi) {
    onPiEvent = (eventObj) => {
      try {
        handlePiEvent(eventObj);
      } catch (error) {
        console.error('Error handling Pi event:', error);
      }
    };
    
    // Subscribe to Pi events
    pi.on('event', onPiEvent);
  }

  // Function to handle Pi events and update job buffers
  const handlePiEvent = (eventObj) => {
    if (eventObj.type === 'agent_start') {
      console.log('Pi started processing a request');
    } else if (eventObj.type === 'message_update') {
      const content = eventObj.data?.content || '';
      // Add content to the *next* job in line that's getting Pi's attention
      // Since Pi processes one active session sequentially, we get responses back in a queue
      if (activeJobQueue.length > 0) {
        // Use FIFO - the first job in the queue that hasn't yet been processed is the one receiving content
        const jobReceivingResponse = activeJobQueue[0];
        jobReceivingResponse.textBuffer += content;
      }
    } else if (eventObj.type === 'agent_end') {
      // When agent ends, the current job at the front of the queue is completed
      if (activeJobQueue.length > 0) {
        const completedJob = activeJobQueue.shift(); // Remove and get first job in queue
        
        // Send the completed response to the respective chat
        if (completedJob) {
          const responseText = completedJob.textBuffer;
          
          // Send response to the original originating chat
          if (responseText.trim()) {
            sendTelegramResponse(telegram, completedJob.chatId, responseText);
          } else {
            sendTelegramResponse(telegram, completedJob.chatId, 'Pi finished without a text response.');
          }
          
          // Clean up: remove this job
          removePendingJob(completedJob.id);
        }
      }
    }
  };

  // Helper to send response with chunking and proper sanitization
  const sendTelegramResponse = async (tg, chatId, response) => {
    if (!tg || !chatId) return;
    
    try {
      // Sanitize response text to remove potential secrets
      let sanitizedResponse = sanitizeResponse(response);
      
      // Split message into chunks respecting the character limit
      // Telegram allows up to 4096 characters so we stay well under at 3900
      const maxLength = 3900;
      
      if (sanitizedResponse.length <= maxLength) {
        // Short response can go directly
        await tg.sendMessage(chatId, sanitizedResponse);
        return;
      }
      
      // For long messages, break into reasonable chunks
      let remaining = sanitizedResponse;
      while (remaining.length > 0) {
        let chunk;
        if (remaining.length <= maxLength) {
          chunk = remaining;
          remaining = '';
        } else {
          // Try to find a suitable breakpoint around the max length
          let cutPoint = maxLength;
          
          // Try cutting before punctuation marks if possible
          for (let i = maxLength; i > maxLength - 500; i--) {
            if (['. ', '! ', '? ', '\n', '\n\n'].some(breakChar => 
                remaining.slice(i - 5, i + 1).includes(breakChar))) {
              cutPoint = i + 1;
              break;
            }
          }
          
          chunk = remaining.substring(0, cutPoint);
          if (chunk.length < maxLength * 0.8) {  // If we couldn't find a good cut point, just cut
            chunk = remaining.substring(0, maxLength);
          }
          remaining = remaining.substring(chunk.length);
        }
        
        if (chunk.trim()) {
          await tg.sendMessage(chatId, chunk);
        }
        
        // Small delay to be respectful to API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      // Use safe error instead of exposing internals
      console.error('Error sending response to Telegram:', error);
      try {
        await tg.sendMessage(chatId, 'Pi response could not be delivered due to a connectivity issue.');
      } catch (sendError) {
        console.error('Could not even send safe error:', sendError);
      }
    }
  };

  // Helper to sanitize response to remove secrets, paths, etc.
  const sanitizeResponse = (response) => {
    if (!response) return 'Pi finished without a text response.';
    
    let sanitized = response.toString();
    
    // Remove common path patterns that could leak system details
    sanitized = sanitized.replace(/(\/[\w\-\.\/]+\/[\w\-\.]*\.[\w]{1,10}(?=\s|$))/g, '<PATH_REMOVED>');
    sanitized = sanitized.replace(/([A-Z]:\\+(?:[\w\-\.\\]+\\)*[\w\-\.]*\.[\w]{1,10}(?=\s|$))/gi, '<PATH_REMOVED>');
    
    // Remove potential API keys or credential patterns
    sanitized = sanitized.replace(/\b(token|api[-_]?key|api[-_]?secret|password|pass|pwd|api|session)[\s:=\`"']+\s*\`*["']?\s*[\w-]{20,}["']?\s*\`*/gi, '<CREDENTIAL_REMOVED>');
    
    // Sanitize potential secrets in config format
    sanitized = sanitized.replace(/(env|environment|\.env|secret[s]?)[\s:=]+"?.*?(["\s]|$)/gi, (match, p1) => `${p1}: <REDACTED>`);
    
    // Avoid revealing raw stack traces or internal errors
    sanitized = sanitized.replace(/(at\s+[^\s]+\s+\[as\s+)?[^\s\)]+\.js:\d+:\d+/g, '[INTERNAL]');
    
    // Apply final length cap - this is our final safeguard
    sanitized = sanitized.substring(0, 4000);
    if (response.length > 4000) {
      sanitized += '... [TEXT_TRUNCATED_FOR_SECURITY]';
    }
    
    return sanitized;
  };

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
      
      // This is a normal message, which goes to Pi as a prompt
      console.log('Received normal text message from authorized user:', messageText);
      
      // Forward the message as a prompt to Pi client if it's available
      if (pi && typeof pi.prompt === 'function' && typeof pi.getIsStreaming === 'function') {
        try {
          // Create a job to track the response for this chat
          const job = addPendingJob(chatId, nextRequestId++, messageText);
          
          const isStreaming = pi.getIsStreaming();
          
          if (isStreaming) {
            // If Pi is currently streaming, send as a follow-up prompt
            await pi.prompt(messageText, "followUp");
            console.log('Normal text sent to Pi as follow-up:', messageText);
            
            // Provide immediate feedback to user that it's queued
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, 'Queued as follow-up.');
            }
          } else {
            // Otherwise send as normal prompt
            await pi.prompt(messageText);
            console.log('Normal text sent to Pi as prompt:', messageText);
            
            // Acknowledge the message was received by Pi
            if (telegram && typeof telegram.sendMessage === 'function') {
              await telegram.sendMessage(chatId, 'Message sent to Pi for processing.');
            }
          }
        } catch (error) {
          console.error('Error sending normal text as prompt to Pi:', error);
          
          // Remove job if there was an error to avoid hanging entries
          // This is simplified - a more robust solution would track specific job ID
          clearChatJobs(chatId);
          
          if (telegram && typeof telegram.sendMessage === 'function') {
            // Send safe error without exposing internal details
            const safeError = 'Could not send message to Pi due to a connection issue.';
            await telegram.sendMessage(chatId, safeError);
            console.error('Safe error sent to chat:', safeError);
          }
        }
      } else {
        // Fallback if Pi client not available
        if (telegram && typeof telegram.sendMessage === 'function') {
          await telegram.sendMessage(chatId, 'Message received by gateway (Pi client not available).');
        }
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

    /**
     * Stop the gateway
     */
    async stop() {
      console.log('Stopping Bot Gateway');
      // Cleanup event listener if set
      if (pi && onPiEvent) {
        pi.removeListener('event', onPiEvent);
        onPiEvent = null;
      }
    }
  };
}

export default { createBotGateway };
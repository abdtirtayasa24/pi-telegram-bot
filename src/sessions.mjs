import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';

/**
 * Sessions Manager for finding, listing, switching, and validating Pi session files
 */
class SessionsDiscovery {
  constructor(config) {
    this.config = config;
    
    // Track active session per chat (using chatId to store last loaded sessions and current session)
    this.chatData = new Map(); // Maps chatId -> { activeSessionPath, sessionList, lastUpdateTimestamp }
  }
  
  /**
   * Discover all Pi session files in the configured session directory
   * @returns {Array<Object>} Array of session file information sorted by modification time (newest first)
   */
  async discoverSessions() {
    const directory = this.config.piSessionDir;
    const result = [];
    
    try {
      // Ensure directory exists
      const files = await readdir(directory);
      
      // Filter for .jsonl files that are in the direct directory only (not subdirectories)
      const jsonlFiles = files.filter(file => 
        file.toLowerCase().endsWith('.jsonl') && 
        file.includes('.') // Ensure it has an extension
      );
      
      // Get stats for each file to get mod time and sort by them
      for (const file of jsonlFiles) {
        try {
          const filePath = join(directory, file);
          const fileStat = await stat(filePath);
          
          if (fileStat.isFile()) { // Ensure it's actually a file
            result.push({
              name: basename(file, '.jsonl'), // Use file stem without .jsonl extension
              fileName: file,
              path: filePath,
              modifiedTime: fileStat.mtime,
              size: fileStat.size,
              isDirectory: fileStat.isDirectory()
            });
          }
        } catch (statErr) {
          // Skip files that can't be accessed
          console.warn(`Warning: Could not access session file ${file}:`, statErr.message);
        }
      }
      
      // Sort by modification time, newest first
      result.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist - return empty array
        return [];
      } else {
        // Some other error occurred
        console.error('Error discovering sessions:', error.message);
        throw error;
      }
    }
    
    return result;
  }
  
  /**
   * Remember the latest session list for a specific chat
   */
  rememberSessionListForChat(chatId, sessionList) {
    const chatInfo = this.chatData.get(chatId) || {};
    chatInfo.sessionList = sessionList;
    chatInfo.lastUpdateTimestamp = new Date();
    this.chatData.set(chatId, chatInfo);
  }
  
  /**
   * Gets available session from the remembered list for this chat
   */
  getSessionListForChat(chatId) {
    const chatInfo = this.chatData.get(chatId);
    return chatInfo?.sessionList || [];
  }
  
  /**
   * Set the active session for a chat
   */
  setActiveSessionForChat(chatId, sessionPath) {
    const chatInfo = this.chatData.get(chatId) || {};
    chatInfo.activeSessionPath = sessionPath;
    this.chatData.set(chatId, chatInfo);
  }
  
  /**
   * Get the active session for a chat
   */
  getActiveSessionForChat(chatId) {
    const chatInfo = this.chatData.get(chatId);
    return chatInfo?.activeSessionPath;
  }
  
  /**
   * Validate that path is within configured session directory (security check)
   * @param {string} sessionPath - The path to validate
   * @returns {boolean} True if path is valid
   */
  validateSessionPath(sessionPath) {
    if (!sessionPath) return false;
    
    // Normalize the paths to avoid traversal attacks
    const normalizedPath = join(sessionPath);  // Clean up the path
    const normalizedSessionDir = join(this.config.piSessionDir);
    
    // Check if the sessionPath starts with the piSessionDir path
    return normalizedPath.startsWith(normalizedSessionDir) && 
           normalizedPath.toLowerCase().endsWith('.jsonl') &&
           normalizedPath.includes(join(this.config.piSessionDir));
  }
  
  /**
   * Resolve a session by index from the chat's session list
   * @param {number} chatId - Chat ID
   * @param {number} sessionIndex - The 0-based index of the session
   * @returns {Object|null} Session info or null if not valid
   */
  getSessionByIndex(chatId, sessionIndex) {
    const sessionList = this.getSessionListForChat(chatId);
    
    // Adjust index to 0-based (as the user provides 1-based via /use 1)
    if (sessionIndex >= 0 && sessionIndex < sessionList.length) {
      return sessionList[sessionIndex];
    }
    
    return null;
  }
  
  /**
   * Format sessions list for display in Telegram
   * @param {Array<Object>} sessions - Array of session info from discoverSessions
   * @param {Date} now - Reference date for calculating "ago" times (defaults to now)
   * @returns {string} Formatted string suitable for Telegram display
   */
  formatSessionsList(sessions, referenceTime = new Date()) {
    if (!sessions || sessions.length === 0) {
      return 'No Pi sessions found.';
    }
    
    return sessions.map((session, index) => {
      const ageStr = this.formatAge(session.modifiedTime, referenceTime);
      return `${index + 1}. ${session.name} -- modified ${ageStr}`;
    }).join('\n');
  }
  
  /**
   * Format time difference as a human-readable "ago" string
   * @private
   */
  formatAge(modifiedTime, referenceTime) {
    const diffMs = referenceTime - modifiedTime;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) {
      return `${diffSecs} second${diffSecs !== 1 ? 's' : ''} ago`;
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
  }
}

export default SessionsDiscovery;
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class PiClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.process = null;
    this.buffer = '';
    this.requestIdCounter = 0;
    this.pendingRequests = new Map();
    this.isStreaming = false;
  }

  /**
   * Start pi rpc subprocess
   */
  start() {
    return new Promise((resolve, reject) => {
      // Spawn pi in RPC mode with session directory
      const args = [
        '--mode', 'rpc',
        '--session-dir', this.config.piSessionDir
      ];
      
      this.process = spawn(this.config.piBin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.piWorkdir
      });

      // Handle JSONL output with LF-only frame boundaries
      this.process.stdout.on('data', (data) => {
        const text = data.toString('utf8');
        this.buffer += text;
        
        // Split on \n only (LF-only as per Pi docs), not \r\n or Unicode separators
        let parts = this.buffer.split('\n');
        // Save the last incomplete part as it might be incomplete
        this.buffer = parts.pop() || '';
        
        for (const part of parts) {
          if (part.trim()) {
            try {
              const obj = JSON.parse(part);
              
              if (obj.type === 'response') {
                // Handle response to our commands
                const reqId = obj.id;
                if (reqId && this.pendingRequests.has(reqId)) {
                  const { resolve: res, reject: rej } = this.pendingRequests.get(reqId);
                  if (obj.success) {
                    res(obj.data);
                  } else {
                    rej(new Error(`RPC command "${obj.command}" failed: ${JSON.stringify(obj)}`));
                  }
                  this.pendingRequests.delete(reqId);
                }
              } else {
                // Handle events from Pi (agent_start, message_update, agent_end, etc.)
                
                // Track streaming state
                if (obj.type === 'agent_start') {
                  this.isStreaming = true;
                } else if (obj.type === 'agent_end') {
                  this.isStreaming = false;
                }
                
                // Emit as generic event
                this.emit('event', obj);
              }
            } catch (err) {
              console.error('Error parsing Pi RPC response:', err, 'Raw:', part);
            }
          }
        }
      });

      // Handle errors
      this.process.stderr.on('data', (data) => {
        if (data) {
          console.error('Pi RPC stderr:', data.toString());
        }
      });

      this.process.on('error', (err) => {
        console.error('Pi subprocess error:', err);
        this.emit('error', err);
      });

      this.process.on('close', (code, signal) => {
        console.log(`Pi subprocess exited with code ${code} and signal ${signal}`);
        this.emit('exit', { code, signal });
      });

      // Resolve when process starts successfully
      // The process is assumed to start correctly, and we'll monitor it through its events
      setTimeout(() => resolve(), 100);
    });
  }

  /**
   * Check if Pi is currently streaming/active
   */
  getIsStreaming() {
    return this.isStreaming;
  }

  /**
   * Send a command to Pi RPC
   */
  send(command) {
    if (!this.process || this.process.exitCode !== null) {
      throw new Error('Pi subprocess is not running');
    }
    
    const requestId = ++this.requestIdCounter;
    const cmd = { ...command, id: requestId };
    
    // Enqueue request promise
    const promise = new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout to prevent hanging
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout for ${command.type}`));
        }
      }, 30000); // 30-second timeout
    });
    
    const jsonString = JSON.stringify(cmd) + '\n';
    this.process.stdin.write(jsonString);
    
    return promise;
  }

  /**
   * Send a prompt to Pi
   */
  prompt(message, streamingBehavior = null) {
    const command = { type: 'prompt', message };
    if (streamingBehavior) {
      command.streamingBehavior = streamingBehavior;
    }
    return this.send(command);
  }

  /**
   * Send a steer command
   */
  steer(message) {
    return this.send({ type: 'steer', message });
  }

  /**
   * Send a follow_up command
   */
  followUp(message) {
    return this.send({ type: 'follow_up', message });
  }

  /**
   * Send a switch_session command
   */
  switchSession(sessionPath) {
    return this.send({ type: 'switch_session', sessionPath });
  }

  /**
   * Send a new_session command
   */
  newSession(parentSession = null) {
    return this.send({ type: 'new_session', parentSession });
  }

  /**
   * Send a get_state command
   */
  getState() {
    return this.send({ type: 'get_state' });
  }

  /**
   * Send an abort command
   */
  abort() {
    return this.send({ type: 'abort' });
  }

  /**
   * Close the Pi process
   */
  close() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export default PiClient;
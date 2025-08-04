import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HttpClient } from "../../../packages/sandbox/src/client";
import "./style.css";

interface CommandResult {
  id: string;
  command: string;
  args: string[];
  status: "running" | "completed" | "error";
  stdout: string;
  stderr: string;
  exitCode?: number;
  timestamp: Date;
}

function REPL() {
  const [client, setClient] = useState<HttpClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [wsConnected, setWsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [wsMessages, setWsMessages] = useState<any[]>([]);
  const [previewUrlInput, setPreviewUrlInput] = useState("");
  const [testWsConnected, setTestWsConnected] = useState(false);
  const [testWsMessages, setTestWsMessages] = useState<any[]>([]);
  const [testWebSocket, setTestWebSocket] = useState<WebSocket | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new results are added
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [results]);

  // Initialize HTTP client
  useEffect(() => {
    const httpClient = new HttpClient({
      baseUrl: window.location.origin,
      onCommandComplete: (
        success: boolean,
        exitCode: number,
        stdout: string,
        stderr: string,
        command: string,
        args: string[]
      ) => {
        setResults((prev) => {
          const updated = [...prev];
          const lastResult = updated[updated.length - 1];
          if (lastResult && lastResult.command === command) {
            lastResult.status = success ? "completed" : "error";
            lastResult.exitCode = exitCode;
            lastResult.stdout = stdout;
            lastResult.stderr = stderr;
          }
          return updated;
        });
        setIsExecuting(false);
      },
      onCommandStart: (command: string, args: string[]) => {
        console.log("Command started:", command, args);
        const newResult: CommandResult = {
          args,
          command,
          id: Date.now().toString(),
          status: "running",
          stderr: "",
          stdout: "",
          timestamp: new Date(),
        };
        setResults((prev) => [...prev, newResult]);
        setIsExecuting(true);
      },
      onError: (error: string, command?: string) => {
        console.error("Command error:", error);
        setResults((prev) => {
          const updated = [...prev];
          const lastResult = updated[updated.length - 1];
          if (lastResult && lastResult.command === command) {
            lastResult.status = "error";
            lastResult.stderr += `\nError: ${error}`;
          }
          return updated;
        });
        setIsExecuting(false);
      },
      onOutput: (
        stream: "stdout" | "stderr",
        data: string,
        command: string
      ) => {
        setResults((prev) => {
          const updated = [...prev];
          const lastResult = updated[updated.length - 1];
          if (lastResult && lastResult.command === command) {
            if (stream === "stdout") {
              lastResult.stdout += data;
            } else {
              lastResult.stderr += data;
            }
          }
          return updated;
        });
      },
      onStreamEvent: (event) => {
        console.log("Stream event:", event);
      },
      onWebSocketConnect: () => {
        console.log("WebSocket connected");
        setWsConnected(true);
      },
      onWebSocketDisconnect: () => {
        console.log("WebSocket disconnected");
        setWsConnected(false);
      },
      onWebSocketMessage: (message) => {
        console.log("WebSocket message received:", message);
        setWsMessages(prev => [...prev, { ...message, timestamp: new Date() }]);
      },
    });

    setClient(httpClient);

    // Initialize connection by creating a session
    const initializeConnection = async () => {
      try {
        setConnectionStatus("connecting");

        // Test connection with ping
        await httpClient.ping();
        console.log("Server is reachable");

        // Create a session
        const session = await httpClient.createSession();
        setSessionId(session);
        setConnectionStatus("connected");
        console.log("Connected with session:", session);
      } catch (error: any) {
        console.error("Failed to connect:", error);
        setConnectionStatus("disconnected");
      }
    };

    initializeConnection();

    // Cleanup on unmount
    return () => {
      if (httpClient) {
        httpClient.clearSession();
      }
    };
  }, []);

  const executeCommand = async () => {
    if (!client || connectionStatus !== "connected" || !commandInput.trim() || isExecuting) {
      return;
    }

    const trimmedCommand = commandInput.trim();
    const parts = trimmedCommand.split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    try {
      setIsExecuting(true);

      // Create a result entry for the command
      const newResult: CommandResult = {
        args,
        command,
        id: Date.now().toString(),
        status: "running",
        stderr: "",
        stdout: "",
        timestamp: new Date(),
      };
      setResults((prev) => [...prev, newResult]);

      // Execute the command
      console.log("Executing command:", command, args);
      const result = await client.execute(
        command,
        args,
        sessionId || undefined
      );
      console.log("Result:", result);

      // Update the result with the response
      setResults((prev) => {
        const updated = [...prev];
        const lastResult = updated[updated.length - 1];
        if (lastResult && lastResult.command === command) {
          lastResult.status = result.success ? "completed" : "error";
          lastResult.exitCode = result.exitCode;
          lastResult.stdout = result.stdout;
          lastResult.stderr = result.stderr;
        }
        return updated;
      });

      setCommandInput("");
    } catch (error: any) {
      console.error("Failed to execute command:", error);
      setResults((prev) => {
        const updated = [...prev];
        const lastResult = updated[updated.length - 1];
        if (lastResult && lastResult.command === command) {
          lastResult.status = "error";
          lastResult.stderr += `\nError: ${error.message || error}`;
        }
        return updated;
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const executeStreamingCommand = async () => {
    if (!client || connectionStatus !== "connected" || !commandInput.trim() || isExecuting) {
      return;
    }

    const trimmedCommand = commandInput.trim();
    const parts = trimmedCommand.split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    try {
      setIsExecuting(true);

      // Create a result entry for the command
      const newResult: CommandResult = {
        args,
        command,
        id: Date.now().toString(),
        status: "running",
        stderr: "",
        stdout: "",
        timestamp: new Date(),
      };
      setResults((prev) => [...prev, newResult]);

      // Execute the command with streaming
      console.log("Executing streaming command:", command, args);
      await client.executeStream(command, args, sessionId || undefined);
      console.log("Streaming command completed");

      setCommandInput("");
    } catch (error: any) {
      console.error("Failed to execute streaming command:", error);
      setResults((prev) => {
        const updated = [...prev];
        const lastResult = updated[updated.length - 1];
        if (lastResult && lastResult.command === command) {
          lastResult.status = "error";
          lastResult.stderr += `\nError: ${error.message || error}`;
        }
        return updated;
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  const clearWebSocketMessages = () => {
    setWsMessages([]);
  };

  const testWebSocketPing = async () => {
    if (!client || !wsConnected) return;
    try {
      client.sendWebSocketMessage({ type: "ping", timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('WebSocket ping error:', error);
    }
  };

  const testPreviewUrl = async () => {
    if (!client || !wsConnected || !previewUrlInput.trim()) return;
    try {
      const url = await client.requestPreviewUrl(previewUrlInput);
      console.log('Preview URL response:', url);
    } catch (error) {
      console.error('Preview URL request error:', error);
    }
  };

  const connectTestWebSocket = () => {
    if (testWebSocket) {
      testWebSocket.close();
    }

    const ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
      console.log('[Test WS] Connected to test WebSocket server');
      setTestWsConnected(true);
      setTestWebSocket(ws);
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Test WS] Received:', message);
        setTestWsMessages(prev => [...prev, { ...message, timestamp: new Date() }]);
      } catch (error) {
        console.error('[Test WS] Error parsing message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('[Test WS] Disconnected from test WebSocket server');
      setTestWsConnected(false);
      setTestWebSocket(null);
    };
    
    ws.onerror = (error) => {
      console.error('[Test WS] Connection error:', error);
      setTestWsConnected(false);
    };
  };

  const disconnectTestWebSocket = () => {
    if (testWebSocket) {
      testWebSocket.close();
    }
  };

  const sendTestMessage = (type: string, data: any = {}) => {
    if (!testWebSocket || testWebSocket.readyState !== WebSocket.OPEN) {
      console.error('[Test WS] WebSocket not connected');
      return;
    }
    
    const message = {
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    testWebSocket.send(JSON.stringify(message));
  };

  const clearTestMessages = () => {
    setTestWsMessages([]);
  };

  const getStatusColor = (status: CommandResult["status"]) => {
    switch (status) {
      case "running":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "error":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status: CommandResult["status"]) => {
    switch (status) {
      case "running":
        return "⏳";
      case "completed":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⏳";
    }
  };

  return (
    <div className="repl-container">
      <div className="header">
        <h1>HTTP REPL</h1>
        <div
          className={`connection-status ${connectionStatus}`}
        >
          {connectionStatus === "connected"
            ? `Connected (${sessionId})`
            : connectionStatus === "connecting"
            ? "Connecting..."
            : "Disconnected"}
        </div>
        <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
          {wsConnected ? "🔌" : "🔌"}
          WebSocket {wsConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="command-bar">
        <span className="command-prompt">$</span>
        <input
          type="text"
          className="command-input"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter command (e.g., ls -la)"
          disabled={isExecuting}
        />
        <div className="action-buttons">
          <button
            type="button"
            onClick={executeCommand}
            disabled={!commandInput.trim() || isExecuting}
            className="btn btn-execute"
          >
            {isExecuting ? "Executing..." : "Execute"}
          </button>
          <button
            type="button"
            onClick={executeStreamingCommand}
            disabled={connectionStatus !== "connected" || !commandInput.trim() || isExecuting}
            className="btn btn-stream"
            title="Execute with real-time streaming output"
          >
            {isExecuting ? "Streaming..." : "Stream"}
          </button>
          <button type="button" onClick={clearResults} className="btn">
            Clear
          </button>
          <button 
            type="button" 
            onClick={async () => {
              if (!client) return;
              try {
                if (!wsConnected) {
                  await client.connectWebSocket();
                  setWsConnected(true);
                } else {
                  client.disconnectWebSocket();
                  setWsConnected(false);
                }
              } catch (error) {
                console.error('WebSocket connection error:', error);
              }
            }} 
            className={`btn ${wsConnected ? 'btn-stream' : ''}`}
          >
            {wsConnected ? 'Disconnect WS' : 'Connect WS'}
          </button>
          <button 
            type="button" 
            onClick={testWebSocketPing}
            disabled={!wsConnected}
            className="btn"
            title="Send WebSocket ping message"
          >
            WS Ping
          </button>
        </div>
      </div>

      <div className="websocket-test-section">
        <h3>WebSocket Testing</h3>
        <div className="websocket-controls">
          <div className="preview-url-test">
            <input
              type="text"
              className="command-input"
              value={previewUrlInput}
              onChange={(e) => setPreviewUrlInput(e.target.value)}
              placeholder="Enter preview URL (e.g., http://localhost:3000)"
              disabled={!wsConnected}
            />
            <button 
              type="button" 
              onClick={testPreviewUrl}
              disabled={!wsConnected || !previewUrlInput.trim()}
              className="btn btn-execute"
            >
              Test Preview URL
            </button>
          </div>
          <button 
            type="button" 
            onClick={clearWebSocketMessages}
            className="btn"
          >
            Clear WS Messages
          </button>
        </div>
        
        {wsMessages.length > 0 && (
          <div className="websocket-messages">
            <h4>WebSocket Messages ({wsMessages.length})</h4>
            <div className="messages-container">
              {wsMessages.map((message, index) => (
                <div key={index} className="ws-message">
                  <div className="message-header">
                    <span className="message-type">{message.type}</span>
                    <span className="message-timestamp">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="message-content">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="test-websocket-section">
        <h3>Test WebSocket Server (ws://localhost:8080)</h3>
        <div className="test-ws-header">
          <div className={`connection-status ${testWsConnected ? 'connected' : 'disconnected'}`}>
            {testWsConnected ? "🔌" : "🔌"}
            Test WebSocket {testWsConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="test-ws-controls">
            <button 
              type="button" 
              onClick={testWsConnected ? disconnectTestWebSocket : connectTestWebSocket}
              className={`btn ${testWsConnected ? 'btn-stream' : 'btn-execute'}`}
            >
              {testWsConnected ? 'Disconnect Test WS' : 'Connect Test WS'}
            </button>
            <button 
              type="button" 
              onClick={clearTestMessages}
              className="btn"
            >
              Clear Test Messages
            </button>
          </div>
        </div>
        
        <div className="test-ws-actions">
          <button 
            type="button" 
            onClick={() => sendTestMessage('ping')}
            disabled={!testWsConnected}
            className="btn"
          >
            Send Ping
          </button>
          <button 
            type="button" 
            onClick={() => sendTestMessage('echo', { message: 'Hello WebSocket!' })}
            disabled={!testWsConnected}
            className="btn"
          >
            Send Echo
          </button>
          <button 
            type="button" 
            onClick={() => sendTestMessage('preview_request', { 
              requestId: `test_${Date.now()}`, 
              url: 'http://localhost:3000/test' 
            })}
            disabled={!testWsConnected}
            className="btn btn-execute"
          >
            Test Preview Request
          </button>
          <button 
            type="button" 
            onClick={() => sendTestMessage('broadcast', { 
              message: 'Hello from the test client!',
              from: 'Test UI'
            })}
            disabled={!testWsConnected}
            className="btn btn-stream"
          >
            Send Broadcast
          </button>
        </div>
        
        {testWsMessages.length > 0 && (
          <div className="websocket-messages">
            <h4>Test WebSocket Messages ({testWsMessages.length})</h4>
            <div className="messages-container">
              {testWsMessages.map((message, index) => (
                <div key={index} className="ws-message">
                  <div className="message-header">
                    <span className="message-type">{message.type}</span>
                    <span className="message-timestamp">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="message-content">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="results-container" ref={resultsEndRef}>
        {results.length === 0 ? (
          <div
            style={{ color: "#8b949e", padding: "2rem", textAlign: "center" }}
          >
            No commands executed yet. Try running a command above.
          </div>
        ) : (
          <div>
            {results.map((result) => (
              <div key={result.id} className="command-result">
                <div className="result-header">
                  <span className="status-icon">
                    {getStatusIcon(result.status)}
                  </span>
                  <div className="command-line">
                    ${" "}
                    <span>
                      {result.command} {result.args.join(" ")}
                    </span>
                  </div>
                  {result.status !== "running" &&
                    result.exitCode !== undefined && (
                      <span className="exit-code">
                        (exit: {result.exitCode})
                      </span>
                    )}
                  <span className="timestamp">
                    {result.timestamp.toLocaleTimeString()}
                  </span>
                </div>

                {result.stdout && (
                  <div className="stdout-output">
                    <pre>{result.stdout}</pre>
                  </div>
                )}

                {result.stderr && (
                  <div className="stderr-output">
                    <pre>{result.stderr}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="help-section">
        <h3>Example Commands</h3>
        <div className="help-grid">
          <div className="help-item">
            <span className="help-command">ls</span> - List files
          </div>
          <div className="help-item">
            <span className="help-command">pwd</span> - Print working directory
          </div>
          <div className="help-item">
            <span className="help-command">echo</span> - Print text
          </div>
          <div className="help-item">
            <span className="help-command">cat</span> - Display file contents
          </div>
          <div className="help-item">
            <span className="help-command">whoami</span> - Show current user
          </div>
          <div className="help-item">
            <span className="help-command">date</span> - Show current date/time
          </div>
        </div>
        <div className="help-note">
          <strong>Note:</strong> Use the "Stream" button for commands that
          produce real-time output (like <code>top</code> or{" "}
          <code>tail -f</code>).
        </div>
        
        <h3>WebSocket Testing</h3>
        <div className="help-grid">
          <div className="help-item">
            <span className="help-command">Connect WS</span> - Connect to container WebSocket
          </div>
          <div className="help-item">
            <span className="help-command">WS Ping</span> - Send ping to container
          </div>
          <div className="help-item">
            <span className="help-command">Test Preview URL</span> - Request preview URL from container
          </div>
          <div className="help-item">
            <span className="help-command">Connect Test WS</span> - Connect to test WebSocket server (port 8080)
          </div>
          <div className="help-item">
            <span className="help-command">Send Ping</span> - Send ping to test server
          </div>
          <div className="help-item">
            <span className="help-command">Send Echo</span> - Send echo message to test server
          </div>
          <div className="help-item">
            <span className="help-command">Test Preview Request</span> - Send preview request to test server
          </div>
          <div className="help-item">
            <span className="help-command">Send Broadcast</span> - Broadcast message to all test server clients
          </div>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<REPL />);

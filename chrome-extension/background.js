import { WebSocketClient } from "./core/websocket-client.js";
import { CommandRegistry } from "./core/command-registry.js";
import { CalculateCommand } from "./commands/calculate-command.js";

let wsClient = null;
let isStarted = false;
let monitorWindow = null;
let commandHistory = [];

// Initialize command registry and register commands
const commandRegistry = new CommandRegistry();
commandRegistry.register(new CalculateCommand());

// Function to create monitor window
async function createMonitorWindow() {
    try {
        if (monitorWindow) {
            try {
                const window = await chrome.windows.get(monitorWindow.id);
                if (window) {
                    chrome.windows.update(monitorWindow.id, { focused: true });
                    return;
                }
            } catch (e) {
                // Window doesn't exist anymore
            }
        }

        const window = await chrome.windows.create({
            url: "popup.html",
            type: "popup",
            width: 400,
            height: 600,
            focused: true,
        });
        monitorWindow = window;
    } catch (error) {
        console.error("Error creating monitor window:", error);
    }
}

// Function to broadcast status to all extension views
function broadcastStatus(connected) {
    try {
        if (monitorWindow) {
            chrome.runtime
                .sendMessage({
                    type: "status",
                    connected: connected,
                    isStarted: isStarted,
                    commandHistory: commandHistory,
                })
                .catch(() => {
                    // Ignore errors when popup is closed
                });
        }
    } catch (error) {
        console.log("Error broadcasting status:", error);
    }
}

// Function to log messages to the UI
function logToUI(content, level = "info") {
    try {
        if (monitorWindow) {
            chrome.runtime
                .sendMessage({
                    type: "log",
                    content: content,
                    level: level,
                })
                .catch(() => {
                    // Ignore errors when popup is closed
                });
        }
    } catch (error) {
        console.log("Error logging to UI:", error);
    }
}

// Listen for extension icon click
chrome.action.onClicked.addListener(() => {
    createMonitorWindow();
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case "start":
                isStarted = true;
                if (!wsClient) {
                    wsClient = new WebSocketClient("ws://localhost:8000/ws");
                    wsClient.setHandlers({
                        onStatusChange: broadcastStatus,
                        onMessage: async (message) => {
                            try {
                                // Store command in history
                                commandHistory.push({
                                    timestamp: new Date().toISOString(),
                                    command: message,
                                });
                                // Keep only last 100 commands
                                if (commandHistory.length > 100) {
                                    commandHistory.shift();
                                }

                                logToUI(`Received command: ${JSON.stringify(message)}`, "info");

                                if (commandRegistry.hasCommand(message.type)) {
                                    const result = await commandRegistry.executeCommand(message.type, message);
                                    if (result.success) {
                                        logToUI(result.message, "success");
                                    } else {
                                        logToUI(result.error, "error");
                                    }
                                } else {
                                    logToUI(`Unknown command type: ${message.type}`, "error");
                                }

                                // Broadcast updated status with new command history
                                broadcastStatus(wsClient.isConnected);
                            } catch (error) {
                                logToUI(`Error processing message: ${error.message}`, "error");
                            }
                        },
                        onLog: logToUI,
                    });
                }
                wsClient.connect();
                wsClient.startKeepAlive();
                break;

            case "stop":
                if (wsClient) {
                    wsClient.disconnect();
                }
                isStarted = false;
                logToUI("Extension stopped", "info");
                break;

            case "retry":
                if (isStarted && wsClient) {
                    wsClient.connect();
                }
                break;

            case "getStatus":
                sendResponse({
                    type: "status",
                    connected: wsClient ? wsClient.isConnected : false,
                    isStarted: isStarted,
                    commandHistory: commandHistory,
                });
                break;
        }
    } catch (error) {
        logToUI(`Error handling message: ${error.message}`, "error");
    }
});

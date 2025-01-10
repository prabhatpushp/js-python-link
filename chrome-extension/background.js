import { WebSocketClient } from "./core/websocket-client.js";

let wsClient = null;
let isStarted = false;
let monitorWindow = null;
let commandHistory = [];
let extensionTab = null; // Track the tab where extension was opened

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

        // Get the current active tab before creating popup
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        extensionTab = tab;

        const window = await chrome.windows.create({
            url: "popup.html",
            type: "popup",
            width: 400,
            height: 600,
            focused: true,
        });
        monitorWindow = window;

        // Inject the content script into the target tab
        await chrome.scripting.executeScript({
            target: { tabId: extensionTab.id },
            files: ["commands.js"],
        });
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

// Function to execute command in extension tab
async function executeCommandInExtensionTab(command) {
    try {
        if (!extensionTab) {
            throw new Error("Extension tab not found. Please reopen the extension.");
        }

        // Check if the tab still exists
        try {
            await chrome.tabs.get(extensionTab.id);
        } catch (e) {
            throw new Error("Original tab no longer exists. Please reopen the extension.");
        }

        const response = await chrome.tabs.sendMessage(extensionTab.id, command);
        return response;
    } catch (error) {
        return { success: false, error: error.message };
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

                                // Execute command in extension tab
                                const result = await executeCommandInExtensionTab(message);
                                if (result.success) {
                                    logToUI(`Command executed successfully: ${JSON.stringify(result)}`, "success");
                                } else {
                                    logToUI(`Command execution failed: ${result.error}`, "error");
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

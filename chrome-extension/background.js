import { WebSocketClient } from "./core/websocket-client.js";

// Global state management
const STATE = {
    wsClient: null,
    isStarted: false,
    monitorWindow: null,
    commandHistory: [],
    extensionTab: null,
    activeConnections: new Map(), // Track active connections by tab ID
};

// Function to cleanup resources
async function cleanup(clientId = null, forceCleanup = false) {
    try {
        if (clientId) {
            // Cleanup specific client
            STATE.activeConnections.delete(clientId);
        } else {
            // Cleanup all
            if (STATE.wsClient) {
                STATE.wsClient.disconnect();
                STATE.wsClient = null;
            }
            STATE.activeConnections.clear();
        }

        if (STATE.activeConnections.size === 0 || forceCleanup) {
            STATE.isStarted = false;
            STATE.monitorWindow = null;
            STATE.extensionTab = null;
            STATE.commandHistory = [];
            broadcastStatus(false);

            // Reload the extension's background page to clear any lingering state
            if (forceCleanup) {
                chrome.runtime.reload();
            }
        }
    } catch (error) {
        console.error("Error during cleanup:", error);
    }
}

// Function to create monitor window
async function createMonitorWindow() {
    try {
        if (STATE.monitorWindow) {
            try {
                const window = await chrome.windows.get(STATE.monitorWindow.id);
                if (window) {
                    chrome.windows.update(STATE.monitorWindow.id, { focused: true });
                    return;
                }
            } catch (e) {
                await cleanup(null, true);
            }
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const clientId = tab.id.toString();

        // Force cleanup of any existing connection for this tab
        if (STATE.activeConnections.has(clientId)) {
            await cleanup(clientId, true);
        }

        STATE.extensionTab = tab;
        STATE.activeConnections.set(clientId, {
            tabId: tab.id,
            timestamp: Date.now(),
        });

        const window = await chrome.windows.create({
            url: "popup.html",
            type: "popup",
            width: 400,
            height: 600,
            focused: true,
        });
        STATE.monitorWindow = window;

        await chrome.scripting.executeScript({
            target: { tabId: STATE.extensionTab.id },
            files: ["commands.js"],
        });
    } catch (error) {
        console.error("Error creating monitor window:", error);
        await cleanup(null, true);
    }
}

// Function to broadcast status to all extension views
function broadcastStatus(connected) {
    try {
        if (STATE.monitorWindow) {
            chrome.runtime
                .sendMessage({
                    type: "status",
                    connected: connected,
                    isStarted: STATE.isStarted,
                    commandHistory: STATE.commandHistory,
                })
                .catch(() => {});
        }
    } catch (error) {
        console.error("Error broadcasting status:", error);
    }
}

// Function to log messages to the UI
function logToUI(content, level = "info") {
    try {
        if (STATE.monitorWindow && STATE.isStarted) {
            chrome.runtime
                .sendMessage({
                    type: "log",
                    content: content,
                    level: level,
                })
                .catch(() => {});
        }
    } catch (error) {
        console.error("Error logging to UI:", error);
    }
}

// Function to execute command in extension tab
async function executeCommandInExtensionTab(command) {
    try {
        if (!STATE.extensionTab) {
            throw new Error("Extension tab not found. Please reopen the extension.");
        }

        try {
            await chrome.tabs.get(STATE.extensionTab.id);
        } catch (e) {
            throw new Error("Original tab no longer exists. Please reopen the extension.");
        }

        const response = await chrome.tabs.sendMessage(STATE.extensionTab.id, command);
        return response;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Listen for extension icon click
chrome.action.onClicked.addListener(() => {
    createMonitorWindow();
});

// Listen for window removal
chrome.windows.onRemoved.addListener(async (windowId) => {
    if (STATE.monitorWindow && STATE.monitorWindow.id === windowId) {
        await cleanup(null, true); // Force cleanup when popup is closed
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (STATE.extensionTab && STATE.extensionTab.id === tabId) {
        await cleanup(null, true); // Force cleanup when monitored tab is closed
    }
    const clientId = tabId.toString();
    if (STATE.activeConnections.has(clientId)) {
        await cleanup(clientId);
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        const clientId = sender.tab ? sender.tab.id.toString() : "popup";

        switch (message.type) {
            case "start":
                if (STATE.wsClient && STATE.wsClient.isConnected) {
                    broadcastStatus(true);
                    return;
                }
                STATE.isStarted = true;
                if (!STATE.wsClient) {
                    STATE.wsClient = new WebSocketClient("ws://localhost:8000/ws");
                    STATE.wsClient.setHandlers({
                        onStatusChange: (connected) => {
                            if (!STATE.isStarted) return;
                            broadcastStatus(connected);
                        },
                        onMessage: async (message) => {
                            if (!STATE.isStarted) return;
                            try {
                                STATE.commandHistory.push({
                                    timestamp: new Date().toISOString(),
                                    command: message,
                                });
                                if (STATE.commandHistory.length > 100) {
                                    STATE.commandHistory.shift();
                                }

                                logToUI(`Received command: ${JSON.stringify(message)}`, "info");

                                const result = await executeCommandInExtensionTab(message);
                                if (result.success) {
                                    logToUI(`Command executed successfully: ${JSON.stringify(result)}`, "success");
                                } else {
                                    logToUI(`Command execution failed: ${result.error}`, "error");
                                }

                                if (STATE.isStarted) {
                                    broadcastStatus(STATE.wsClient.isConnected);
                                }
                            } catch (error) {
                                logToUI(`Error processing message: ${error.message}`, "error");
                            }
                        },
                        onLog: logToUI,
                    });
                }
                STATE.wsClient.connect();
                STATE.wsClient.startKeepAlive();
                break;

            case "stop":
                cleanup(clientId, true).catch(console.error); // Force cleanup on manual stop
                logToUI("Extension stopped", "info");
                break;

            case "retry":
                if (STATE.isStarted && STATE.wsClient) {
                    STATE.wsClient.connect();
                }
                break;

            case "getStatus":
                sendResponse({
                    type: "status",
                    connected: STATE.wsClient ? STATE.wsClient.isConnected : false,
                    isStarted: STATE.isStarted,
                    commandHistory: STATE.commandHistory,
                });
                break;
        }
    } catch (error) {
        logToUI(`Error handling message: ${error.message}`, "error");
    }
});

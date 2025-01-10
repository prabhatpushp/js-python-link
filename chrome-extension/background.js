let ws = null;
let isConnected = false;
let isStarted = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 3000;
let retryTimeout = null;
let monitorWindow = null;
let commandHistory = [];

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

// Listen for extension icon click
chrome.action.onClicked.addListener(() => {
    createMonitorWindow();
});

// Function to broadcast status to all extension views
function broadcastStatus(connected) {
    try {
        isConnected = connected;
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

function clearRetryTimeout() {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }
}

function stopWebSocket() {
    try {
        clearRetryTimeout();
        if (ws) {
            ws.close();
            ws = null;
        }
        isConnected = false;
        isStarted = false;
        connectionAttempts = 0;
        broadcastStatus(false);
    } catch (error) {
        logToUI(`Error stopping WebSocket: ${error.message}`, "error");
    }
}

// Keep alive ping
function startKeepAlive() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 30000); // Send ping every 30 seconds
}

async function connectWebSocket() {
    try {
        if (!isStarted) {
            logToUI("Extension not started. Please start the extension first.", "info");
            return;
        }

        if (ws && ws.readyState === WebSocket.CONNECTING) {
            logToUI("Connection attempt already in progress", "info");
            return;
        }

        // Clear any existing connection
        if (ws) {
            try {
                ws.close();
            } catch (e) {
                // Ignore close errors
            }
            ws = null;
        }

        connectionAttempts++;
        logToUI(`Connection attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS}`, "info");

        ws = new WebSocket("ws://localhost:8000/ws");

        ws.onopen = () => {
            try {
                clearRetryTimeout();
                connectionAttempts = 0;
                broadcastStatus(true);
                logToUI("Connected to Python controller", "success");
            } catch (error) {
                logToUI(`Error in onopen handler: ${error.message}`, "error");
            }
        };

        ws.onmessage = async (event) => {
            try {
                const command = JSON.parse(event.data);
                // Store command in history
                commandHistory.push({
                    timestamp: new Date().toISOString(),
                    command: command,
                });
                // Keep only last 100 commands
                if (commandHistory.length > 100) {
                    commandHistory.shift();
                }

                logToUI(`Received command: ${JSON.stringify(command)}`, "info");

                if (command.type === "calculate") {
                    logToUI(`Processing calculation: ${command.num1} + ${command.num2}`, "info");

                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs && tabs.length > 0) {
                        await chrome.tabs.sendMessage(tabs[0].id, command);
                        logToUI("Calculation command sent to content script", "success");
                    } else {
                        logToUI("No active tab found to perform calculation", "error");
                    }
                }

                // Broadcast updated status with new command history
                broadcastStatus(isConnected);
            } catch (error) {
                logToUI(`Error processing message: ${error.message}`, "error");
            }
        };

        ws.onclose = () => {
            try {
                broadcastStatus(false);
                if (isStarted && connectionAttempts < MAX_RETRY_ATTEMPTS) {
                    logToUI(`Connection lost. Retrying in ${RETRY_DELAY / 1000} seconds... (Attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS})`, "info");
                    clearRetryTimeout();
                    retryTimeout = setTimeout(connectWebSocket, RETRY_DELAY);
                } else if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
                    logToUI(`Failed to connect after ${MAX_RETRY_ATTEMPTS} attempts. Click 'Retry Connection' to try again.`, "error");
                    connectionAttempts = 0; // Reset for manual retry
                }
            } catch (error) {
                logToUI(`Error in onclose handler: ${error.message}`, "error");
            }
        };

        ws.onerror = (error) => {
            try {
                logToUI("Unable to connect to Python server. Please ensure it's running on localhost:8000", "error");
                if (error.message) {
                    logToUI(`Error details: ${error.message}`, "error");
                }
            } catch (err) {
                console.log("Error in onerror handler:", err);
            }
        };
    } catch (error) {
        logToUI(`Connection error: ${error.message}`, "error");
        broadcastStatus(false);
    }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case "start":
                isStarted = true;
                connectionAttempts = 0;
                clearRetryTimeout();
                logToUI("Extension started", "info");
                connectWebSocket();
                startKeepAlive();
                break;

            case "stop":
                stopWebSocket();
                logToUI("Extension stopped", "info");
                break;

            case "retry":
                if (isStarted) {
                    connectionAttempts = 0;
                    clearRetryTimeout();
                    connectWebSocket();
                }
                break;

            case "getStatus":
                sendResponse({
                    type: "status",
                    connected: isConnected,
                    isStarted: isStarted,
                    commandHistory: commandHistory,
                });
                break;
        }
    } catch (error) {
        logToUI(`Error handling message: ${error.message}`, "error");
    }
});

let isInitialized = false;
let isStarted = false;

// Function to initialize the extension
async function initializeExtension() {
    try {
        const response = await chrome.runtime.sendMessage({ type: "initialize" });
        isInitialized = response?.isInitialized || false;
        if (isInitialized) {
            addLogEntry("Extension initialized successfully", "info");
        } else {
            addLogEntry("Failed to initialize extension", "error");
        }
        updateConnectionStatus(false);
    } catch (error) {
        console.error("Initialization error:", error);
        addLogEntry("Failed to initialize extension: " + error.message, "error");
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "status") {
        updateConnectionStatus(message.connected);
        if (message.commandHistory) {
            updateCommandHistory(message.commandHistory);
        }
    } else if (message.type === "log") {
        addLogEntry(message.content, message.level);
    }
});

function updateConnectionStatus(isConnected) {
    const statusDiv = document.getElementById("connectionStatus");
    const retryButton = document.getElementById("retryButton");
    const startButton = document.getElementById("startButton");
    const startIcon = startButton.querySelector(".start-icon");
    const startText = startButton.querySelector(".start-text");
    const stopIcon = startButton.querySelector(".stop-icon");
    const stopText = startButton.querySelector(".stop-text");

    if (!isInitialized) {
        statusDiv.className = "status disconnected";
        statusDiv.textContent = "Not Initialized";
        retryButton.disabled = true;
        startButton.disabled = true;
        return;
    }

    if (!isStarted) {
        statusDiv.className = "status disconnected";
        statusDiv.textContent = "Stopped";
        retryButton.disabled = true;

        // Show start button state
        startIcon.classList.remove("hidden");
        startText.classList.remove("hidden");
        stopIcon.classList.add("hidden");
        stopText.classList.add("hidden");
        startButton.classList.remove("started");
        startButton.disabled = false;
        return;
    }

    statusDiv.className = `status ${isConnected ? "connected" : "disconnected"}`;
    statusDiv.textContent = isConnected ? "Connected" : "Connection Failed";
    retryButton.disabled = isConnected;
    startButton.disabled = false;

    // Show stop button state
    startIcon.classList.add("hidden");
    startText.classList.add("hidden");
    stopIcon.classList.remove("hidden");
    stopText.classList.remove("hidden");
    startButton.classList.add("started");
}

function updateCommandHistory(history) {
    const historyContainer = document.getElementById("commandHistory");
    if (!historyContainer) return;

    historyContainer.innerHTML = "";
    history
        .slice()
        .reverse()
        .forEach((item) => {
            const entry = document.createElement("div");
            entry.className = "command-entry";
            const time = new Date(item.timestamp).toLocaleTimeString();
            entry.innerHTML = `
            <div class="command-time">${time}</div>
            <div class="command-content">${JSON.stringify(item.command, null, 2)}</div>
        `;
            historyContainer.appendChild(entry);
        });

    // Show/hide command history section based on content
    const commandSection = document.getElementById("commandHistorySection");
    commandSection.classList.toggle("hidden", history.length === 0);
}

function addLogEntry(content, level = "info") {
    const logContainer = document.getElementById("logContainer");
    const entry = document.createElement("div");
    entry.className = `log-entry ${level}`;
    entry.textContent = `${new Date().toLocaleTimeString()} - ${content}`;
    logContainer.insertBefore(entry, logContainer.firstChild);

    // Show logs section when entries are added
    document.getElementById("logsSection").classList.remove("hidden");
}

// Initialize the extension when popup opens
window.addEventListener("DOMContentLoaded", async () => {
    await initializeExtension();
    // Request initial status after initialization
    chrome.runtime.sendMessage({ type: "getStatus" }, (response) => {
        if (response) {
            isInitialized = response.isInitialized;
            isStarted = response.isStarted;
            updateConnectionStatus(response.connected);
            if (response.commandHistory) {
                updateCommandHistory(response.commandHistory);
            }
        }
    });
});

// Handle start/stop button click
document.getElementById("startButton").addEventListener("click", () => {
    if (!isInitialized) {
        addLogEntry("Extension not initialized", "error");
        return;
    }

    isStarted = !isStarted;
    if (isStarted) {
        chrome.runtime.sendMessage({ type: "start" });
        addLogEntry("Starting Connection...", "info");
    } else {
        chrome.runtime.sendMessage({ type: "stop" });
        addLogEntry("Stopping Connection...", "info");
    }
    updateConnectionStatus(false);
});

// Handle retry button click
document.getElementById("retryButton").addEventListener("click", () => {
    if (isStarted) {
        chrome.runtime.sendMessage({ type: "retry" });
        addLogEntry("Retrying connection...", "info");
    }
});

// Handle clear logs click
document.getElementById("clearLogs").addEventListener("click", () => {
    document.getElementById("logContainer").innerHTML = "";
    document.getElementById("commandHistory").innerHTML = "";
    // Hide sections when cleared
    document.getElementById("logsSection").classList.add("hidden");
    document.getElementById("commandHistorySection").classList.add("hidden");
    addLogEntry("Logs cleared", "info");
});

// Handle window unload (exit)
window.addEventListener("unload", () => {
    chrome.runtime.sendMessage({ type: "exit" });
});

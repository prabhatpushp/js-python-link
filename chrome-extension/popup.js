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
    const startButton = document.getElementById("startButton");
    const buttonText = startButton.querySelector(".button-text");

    if (!isInitialized) {
        startButton.disabled = true;
        buttonText.textContent = "Not Initialized";
        startButton.classList.remove("connected");
        return;
    }

    if (!isStarted) {
        startButton.disabled = false;
        buttonText.textContent = "Start";
        startButton.classList.remove("connected");
        return;
    }

    startButton.disabled = false;
    buttonText.textContent = isConnected ? "Stop" : "Connecting...";
    startButton.classList.toggle("connected", isConnected);
}

function updateCommandHistory(history) {
    const commandEntries = document.getElementById("commandEntries");
    if (!commandEntries) return;

    commandEntries.innerHTML = "";

    if (history && history.length > 0) {
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
                commandEntries.appendChild(entry);
            });
    }
}

function addLogEntry(content, level = "info") {
    const logEntries = document.getElementById("logEntries");
    const entry = document.createElement("div");
    entry.className = `log-entry ${level}`;
    entry.textContent = `${new Date().toLocaleTimeString()} - ${content}`;
    logEntries.insertBefore(entry, logEntries.firstChild);
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

// Handle settings button click
document.getElementById("settingsButton").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

// Handle clear logs click
document.getElementById("clearLogs")?.addEventListener("click", () => {
    // Clear entries
    document.getElementById("logEntries").innerHTML = "";
    document.getElementById("commandEntries").innerHTML = "";

    // Add the "cleared" log entry after a brief delay to ensure empty state is shown
    setTimeout(() => {
        addLogEntry("Logs cleared", "info");
    }, 50);
});

// Handle window unload (exit)
window.addEventListener("unload", () => {
    chrome.runtime.sendMessage({ type: "exit" });
});

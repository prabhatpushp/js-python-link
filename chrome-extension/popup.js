let isStarted = false;

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

    if (!isStarted) {
        statusDiv.className = "status disconnected";
        statusDiv.textContent = "Not Started";
        retryButton.disabled = true;
        startButton.textContent = "Start Extension";
        startButton.classList.remove("started");
        return;
    }

    statusDiv.className = `status ${isConnected ? "connected" : "disconnected"}`;
    statusDiv.textContent = isConnected ? "Connected" : "Connection Failed";
    retryButton.disabled = isConnected;
    startButton.textContent = "Stop Extension";
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
}

function addLogEntry(content, level = "info") {
    const logContainer = document.getElementById("logContainer");
    const entry = document.createElement("div");
    entry.className = `log-entry ${level}`;
    entry.textContent = `${new Date().toLocaleTimeString()} - ${content}`;
    logContainer.insertBefore(entry, logContainer.firstChild);
}

// Handle start button click
document.getElementById("startButton").addEventListener("click", () => {
    isStarted = !isStarted;
    if (isStarted) {
        chrome.runtime.sendMessage({ type: "start" });
        addLogEntry("Starting extension...", "info");
    } else {
        chrome.runtime.sendMessage({ type: "stop" });
        addLogEntry("Stopping extension...", "info");
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
    addLogEntry("Logs cleared", "info");
});

// Request initial status when popup opens
chrome.runtime.sendMessage({ type: "getStatus" }, (response) => {
    if (response) {
        isStarted = response.isStarted;
        updateConnectionStatus(response.connected);
        if (response.commandHistory) {
            updateCommandHistory(response.commandHistory);
        }
    }
});

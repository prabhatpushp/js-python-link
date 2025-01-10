class WebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            maxRetryAttempts: 5,
            retryDelay: 3000,
            ...options,
        };
        this.ws = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.retryTimeout = null;
        this.onStatusChange = null;
        this.onMessage = null;
        this.onLog = null;
    }

    setHandlers({ onStatusChange, onMessage, onLog }) {
        this.onStatusChange = onStatusChange;
        this.onMessage = onMessage;
        this.onLog = onLog;
    }

    log(content, level = "info") {
        if (this.onLog) {
            this.onLog(content, level);
        }
    }

    updateStatus(connected) {
        this.isConnected = connected;
        if (this.onStatusChange) {
            this.onStatusChange(connected);
        }
    }

    clearRetryTimeout() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
    }

    async connect() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                this.log("Connection attempt already in progress", "info");
                return;
            }

            if (this.ws) {
                try {
                    this.ws.close();
                } catch (e) {
                    // Ignore close errors
                }
                this.ws = null;
            }

            this.connectionAttempts++;
            this.log(`Connection attempt ${this.connectionAttempts}/${this.options.maxRetryAttempts}`, "info");

            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this.clearRetryTimeout();
                this.connectionAttempts = 0;
                this.updateStatus(true);
                this.log("Connected to Python controller", "success");
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (this.onMessage) {
                        this.onMessage(message);
                    }
                } catch (error) {
                    this.log(`Error processing message: ${error.message}`, "error");
                }
            };

            this.ws.onclose = () => {
                this.updateStatus(false);
                if (this.connectionAttempts < this.options.maxRetryAttempts) {
                    this.log(`Connection lost. Retrying in ${this.options.retryDelay / 1000} seconds... (Attempt ${this.connectionAttempts}/${this.options.maxRetryAttempts})`, "info");
                    this.clearRetryTimeout();
                    this.retryTimeout = setTimeout(() => this.connect(), this.options.retryDelay);
                } else {
                    this.log(`Failed to connect after ${this.options.maxRetryAttempts} attempts. Click 'Retry Connection' to try again.`, "error");
                    this.connectionAttempts = 0;
                }
            };

            this.ws.onerror = (error) => {
                this.log("Unable to connect to Python server. Please ensure it's running on localhost:8000", "error");
                if (error.message) {
                    this.log(`Error details: ${error.message}`, "error");
                }
            };
        } catch (error) {
            this.log(`Connection error: ${error.message}`, "error");
            this.updateStatus(false);
        }
    }

    disconnect() {
        this.clearRetryTimeout();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.updateStatus(false);
    }

    startKeepAlive() {
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
    }
}

export { WebSocketClient };

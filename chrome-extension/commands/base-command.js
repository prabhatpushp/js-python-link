class BaseCommand {
    constructor(type) {
        this.type = type;
    }

    async execute(data) {
        throw new Error("Execute method must be implemented by derived classes");
    }

    static async sendToActiveTab(message) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            return await chrome.tabs.sendMessage(tabs[0].id, message);
        }
        throw new Error("No active tab found");
    }
}

export { BaseCommand };

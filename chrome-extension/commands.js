// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        if (message.type === "calculate") {
            const { num1, num2 } = message;
            const result = num1 + num2;
            console.log(`Calculation Result: ${num1} + ${num2} = ${result}`);
            sendResponse({ success: true, result });
        } else {
            console.error(`Unknown command type: ${message.type}`);
            sendResponse({ success: false, error: `Unknown command type: ${message.type}` });
        }
    } catch (error) {
        console.error("Error executing command:", error);
        sendResponse({ success: false, error: error.message });
    }
    return true; // Required to use sendResponse asynchronously
});

// Log that the commands script has been loaded
console.log("Commands script loaded and ready to execute commands");

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "calculate") {
        const { num1, num2 } = message;
        const result = num1 + num2;
        console.log(`Calculation Result: ${num1} + ${num2} = ${result}`);
    }
});

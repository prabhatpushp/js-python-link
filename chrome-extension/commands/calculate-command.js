import { BaseCommand } from "./base-command.js";

class CalculateCommand extends BaseCommand {
    constructor() {
        super("calculate");
    }

    async execute(data) {
        try {
            await BaseCommand.sendToActiveTab(data);
            return { success: true, message: "Calculation command sent to content script" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export { CalculateCommand };

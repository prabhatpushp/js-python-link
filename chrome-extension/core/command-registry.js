class CommandRegistry {
    constructor() {
        this.commands = new Map();
    }

    register(command) {
        this.commands.set(command.type, command);
    }

    async executeCommand(type, data) {
        const command = this.commands.get(type);
        if (!command) {
            throw new Error(`Command type '${type}' not found`);
        }
        return await command.execute(data);
    }

    hasCommand(type) {
        return this.commands.has(type);
    }
}

export { CommandRegistry };

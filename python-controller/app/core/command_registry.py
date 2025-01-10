from typing import Dict, Type
from ..commands.base_command import BaseCommand
from ..commands.calculate_command import CalculateCommand
from .websocket_manager import WebSocketManager

class CommandRegistry:
    def __init__(self, websocket_manager: WebSocketManager):
        self.websocket_manager = websocket_manager
        self._commands: Dict[str, BaseCommand] = {}
        self._register_default_commands()

    def _register_default_commands(self):
        """Register all default commands"""
        self.register_command(CalculateCommand(self.websocket_manager))

    def register_command(self, command: BaseCommand):
        """Register a new command"""
        self._commands[command.command_type] = command

    def get_command(self, command_type: str) -> BaseCommand:
        """Get a command by its type"""
        return self._commands.get(command_type)

    def get_all_commands(self) -> Dict[str, BaseCommand]:
        """Get all registered commands"""
        return self._commands 
from abc import ABC, abstractmethod
from typing import Any, Dict

class BaseCommand(ABC):
    @property
    @abstractmethod
    def command_type(self) -> str:
        """Return the type of command"""
        pass

    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute the command and return a response"""
        pass

    def create_command_message(self, **kwargs) -> Dict[str, Any]:
        """Create the command message to send to the extension"""
        return {
            "type": self.command_type,
            **kwargs
        } 
from typing import Any, Dict
from .base_command import BaseCommand
from ..core.websocket_manager import WebSocketManager

class CalculateCommand(BaseCommand):
    def __init__(self, websocket_manager: WebSocketManager):
        self.websocket_manager = websocket_manager

    @property
    def command_type(self) -> str:
        return "calculate"

    async def execute(self, num1: int, num2: int) -> Dict[str, Any]:
        if self.websocket_manager.get_connection_count() == 0:
            return {"error": "No active WebSocket connections"}

        command = self.create_command_message(num1=num1, num2=num2)
        await self.websocket_manager.broadcast_json(command)
        
        return {"message": "Calculation command sent"} 
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.core.websocket_manager import WebSocketManager
from app.core.command_registry import CommandRegistry

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize core components
websocket_manager = WebSocketManager()
command_registry = CommandRegistry(websocket_manager)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except:
        websocket_manager.disconnect(websocket)

@app.post("/calculate/{num1}/{num2}")
async def calculate(num1: int, num2: int):
    calculate_command = command_registry.get_command("calculate")
    if not calculate_command:
        return {"error": "Calculate command not found"}
    
    return await calculate_command.execute(num1=num1, num2=num2)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
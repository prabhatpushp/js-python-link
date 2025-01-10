from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections
active_connections: list[WebSocket] = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except:
        active_connections.remove(websocket)

@app.post("/calculate/{num1}/{num2}")
async def calculate(num1: int, num2: int):
    if not active_connections:
        return {"error": "No active WebSocket connections"}
    
    # Send calculation command to extension
    command = {
        "type": "calculate",
        "num1": num1,
        "num2": num2
    }
    
    for connection in active_connections:
        await connection.send_json(command)
    
    return {"message": "Calculation command sent"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
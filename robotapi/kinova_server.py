#!/usr/bin/env python3
import asyncio
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from kortex_api.RouterClient import RouterClient
from kortex_api.SessionManager import SessionManager
from kortex_api.TCPTransport import TCPTransport
from kortex_api.autogen.client_stubs.BaseClientRpc import BaseClient
from kortex_api.autogen.messages import Base_pb2, Session_pb2


@dataclass
class LastCommand:
    position: Optional[float] = None
    percent: Optional[float] = None
    published: bool = False
    timestamp: Optional[float] = None


@dataclass
class RobotConfig:
    ip: str = "192.168.1.101"
    port: int = 10000
    username: str = "admin"
    password: str = "admin"


class KinovaRobot:
    def __init__(self, config: RobotConfig):
        self.config = config
        self.transport: Optional[TCPTransport] = None
        self.router: Optional[RouterClient] = None
        self.session_manager: Optional[SessionManager] = None
        self.base: Optional[BaseClient] = None
        self.connected = False
        self.lock = asyncio.Lock()
        self.last_command = LastCommand()
        self.presets: Dict[str, List[float]] = {
            "home": [0, 15, 180, 230, 0, 55, 90],
            "zero": [0, 0, 0, 0, 0, 0, 0],
            "vertical": [0, 0, 180, 0, 0, 0, 0],
            "retract": [0, 30, 180, 200, 0, 40, 90],
            "ready": [0, 15, 130, 210, 0, 60, 90],
        }

    def _err(self, e):
        print(f"[KORTEX ERROR] {e}")

    def _validate_position(self, v):
        v = float(v)
        if not 0 <= v <= 1:
            raise ValueError("position 0.0-1.0")
        return v

    def _validate_percent(self, v):
        v = float(v)
        if not 0 <= v <= 100:
            raise ValueError("percent 0-100")
        return v

    def _validate_joints(self, j):
        if not isinstance(j, (list, tuple)):
            raise ValueError("joints must be list")
        if len(j) not in (6, 7):
            raise ValueError("joints need 6 or 7 values")
        return [float(x) for x in j]

    def is_connected(self):
        return self.connected and self.base is not None

    async def connect(self):
        async with self.lock:
            if self.connected:
                return {
                    "ok": True,
                    "connected": True,
                    "message": "already connected",
                    "robot_ip": self.config.ip,
                }
            try:
                self.transport = TCPTransport()
                self.router = RouterClient(self.transport, self._err)
                await asyncio.to_thread(
                    self.transport.connect, self.config.ip, self.config.port
                )
                info = Session_pb2.CreateSessionInfo()
                info.username = self.config.username
                info.password = self.config.password
                info.session_inactivity_timeout = 60000
                info.connection_inactivity_timeout = 2000
                self.session_manager = SessionManager(self.router)
                await asyncio.to_thread(self.session_manager.CreateSession, info)
                self.base = BaseClient(self.router)
                await asyncio.to_thread(self.base.GetArmState)
                self.connected = True
                return {
                    "ok": True,
                    "connected": True,
                    "message": "Kinova Gen3 connected",
                    "robot_ip": self.config.ip,
                }
            except Exception as e:
                self.connected = False
                try:
                    if self.session_manager:
                        await asyncio.to_thread(self.session_manager.CloseSession)
                except Exception:
                    pass
                try:
                    if self.transport:
                        await asyncio.to_thread(self.transport.disconnect)
                except Exception:
                    pass
                self.transport = None
                self.router = None
                self.session_manager = None
                self.base = None
                return {
                    "ok": False,
                    "connected": False,
                    "message": str(e),
                    "robot_ip": self.config.ip,
                }

    async def disconnect(self):
        async with self.lock:
            try:
                if self.session_manager:
                    await asyncio.to_thread(self.session_manager.CloseSession)
            except Exception as e:
                print(e)
            try:
                if self.transport:
                    await asyncio.to_thread(self.transport.disconnect)
            except Exception as e:
                print(e)
            self.transport = None
            self.router = None
            self.session_manager = None
            self.base = None
            self.connected = False
            return {
                "ok": True,
                "connected": False,
                "message": "Kinova Gen3 disconnected",
            }

    async def gripper_position(self, position):
        if not self.is_connected():
            return {
                "ok": False,
                "status": "NOT_CONNECTED",
                "message": "not connected",
            }, 503
        try:
            position = self._validate_position(position)
            cmd = Base_pb2.GripperCommand()
            cmd.mode = Base_pb2.GRIPPER_POSITION
            finger = cmd.gripper.finger.add()
            finger.finger_identifier = 1
            finger.value = position
            await asyncio.to_thread(self.base.SendGripperCommand, cmd)
            percent = position * 100.0
            self.last_command.position = position
            self.last_command.percent = percent
            self.last_command.published = True
            self.last_command.timestamp = time.time()
            return {
                "ok": True,
                "status": "PUBLISHED",
                "position_commanded": position,
                "percent": percent,
                "robot_ip": self.config.ip,
            }, 200
        except Exception as e:
            return {"ok": False, "status": "ERROR", "message": str(e)}, 500

    async def joint_angles(self, joints):
        if not self.is_connected():
            return {
                "ok": False,
                "status": "NOT_CONNECTED",
                "message": "not connected",
            }, 503
        try:
            joints = self._validate_joints(joints)
            action = Base_pb2.Action()
            action.name = "Joint angles"
            action.application_data = ""
            angles = action.reach_joint_angles.joint_angles.joint_angles
            for idx, val in enumerate(joints):
                ja = angles.add()
                ja.joint_identifier = idx
                ja.value = float(val)
            await asyncio.to_thread(self.base.ExecuteAction, action)
            return {
                "ok": True,
                "status": "PUBLISHED",
                "joints": joints,
                "robot_ip": self.config.ip,
            }, 200
        except Exception as e:
            return {"ok": False, "status": "ERROR", "message": str(e)}, 500


config = RobotConfig()
robot = KinovaRobot(config)
app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/status")
async def status():
    return {
        "ok": True,
        "connected": robot.is_connected(),
        "robot_ip": config.ip,
        "robot_port": config.port,
        "last_command": robot.last_command.__dict__,
        "presets": list(robot.presets.keys()),
    }


@app.post("/api/connect")
async def api_connect():
    r = await robot.connect()
    return JSONResponse(r, status_code=200 if r["ok"] else 503)


@app.post("/api/disconnect")
async def api_disconnect():
    return await robot.disconnect()


@app.post("/api/gripper/set")
async def gripper(request: Request):
    data = await request.json()
    if not isinstance(data, dict):
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "JSON body required"},
            status_code=400,
        )
    if "position" not in data:
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "position required"},
            status_code=400,
        )
    result, code = await robot.gripper_position(data["position"])
    return JSONResponse(result, status_code=code)


@app.post("/api/gripper/percent")
async def gripper_percent(request: Request):
    data = await request.json()
    if not isinstance(data, dict):
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "JSON body required"},
            status_code=400,
        )
    if "percent" not in data:
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "percent required"},
            status_code=400,
        )
    try:
        percent = robot._validate_percent(data["percent"])
    except ValueError as e:
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": str(e)},
            status_code=400,
        )
    result, code = await robot.gripper_position(percent / 100.0)
    result["percent"] = percent
    return JSONResponse(result, status_code=code)


@app.post("/api/gripper/open")
async def open_gripper():
    result, code = await robot.gripper_position(0.0)
    return JSONResponse(result, status_code=code)


@app.post("/api/gripper/close")
async def close_gripper():
    result, code = await robot.gripper_position(1.0)
    return JSONResponse(result, status_code=code)


@app.post("/api/joints")
async def api_joints(request: Request):
    data = await request.json()
    if not isinstance(data, dict):
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "JSON body required"},
            status_code=400,
        )
    if "joints" not in data:
        return JSONResponse(
            {"ok": False, "status": "INVALID", "message": "joints required"},
            status_code=400,
        )
    result, code = await robot.joint_angles(data["joints"])
    return JSONResponse(result, status_code=code)


@app.post("/api/position/{name}")
async def api_position(name: str):
    key = name.lower()
    if key not in robot.presets:
        return JSONResponse(
            {
                "ok": False,
                "status": "INVALID",
                "message": f"unknown preset {name}, available {list(robot.presets.keys())}",
            },
            status_code=400,
        )
    result, code = await robot.joint_angles(robot.presets[key])
    result["preset"] = key
    return JSONResponse(result, status_code=code)


@app.get("/api/positions")
async def api_positions():
    return {"ok": True, "presets": robot.presets}


if __name__ == "__main__":
    print(f"Kinova Gen3 Server | {config.ip}:{config.port} | HTTP 8001")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")

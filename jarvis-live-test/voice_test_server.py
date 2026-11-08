"""Standalone Gemini Live voice test. No SmartInventory imports or DB tools."""

import asyncio
import json
import logging
from contextlib import suppress
from pathlib import Path

from dotenv import dotenv_values
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from google import genai
from google.genai import types
from starlette.middleware.trustedhost import TrustedHostMiddleware

BASE = Path(__file__).resolve().parent
ORIGINS = {"http://localhost:8001", "http://127.0.0.1:8001"}
logger = logging.getLogger("jarvis.voice_test")

app = FastAPI(title="Jarvis voice test", docs_url=None, redoc_url=None)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1"],
)


def settings():
    # Read only this test folder's file, never the main project's .env.
    values = dotenv_values(BASE / ".env.test", interpolate=False)
    return {
        "key": (values.get("GOOGLE_API_KEY") or "").strip(),
        "model": (values.get("TEST_LIVE_MODEL") or "gemini-3.8-live").strip(),
        "voice": (values.get("TEST_LIVE_VOICE") or "Charon").strip(),
    }


@app.get("/")
def page():
    return FileResponse(BASE / "voice-test.html")


@app.get("/testAudio.js")
def audio_module():
    return FileResponse(BASE / "testAudio.js", media_type="text/javascript")


@app.get("/testCapture.worklet.js")
def capture_module():
    return FileResponse(BASE / "testCapture.worklet.js", media_type="text/javascript")


@app.get("/health")
def health():
    config = settings()
    return {
        "status": "ok",
        "mode": "voice-test-only",
        "inventory_connected": False,
        "model": config["model"],
        "key_configured": bool(
            config["key"] and config["key"] != "PASTE_YOUR_KEY_HERE"
        ),
    }


class VoiceTestBridge:
    def __init__(self, socket, session):
        self.socket = socket
        self.session = session
        self.lock = asyncio.Lock()

    async def send(self, message):
        async with self.lock:
            if isinstance(message, bytes):
                await self.socket.send_bytes(message)
            else:
                await self.socket.send_json(message)

    async def from_browser(self):
        while True:
            packet = await self.socket.receive()
            if packet["type"] == "websocket.disconnect":
                return

            audio = packet.get("bytes")
            if audio is not None:
                if not audio or len(audio) > 6400 or len(audio) % 2:
                    raise ValueError("Invalid PCM packet")
                await self.session.send_realtime_input(
                    audio=types.Blob(data=audio, mime_type="audio/pcm;rate=16000")
                )
                continue

            raw = packet.get("text") or ""
            if len(raw) > 5000:
                raise ValueError("Message is too large")
            event = json.loads(raw)
            if not isinstance(event, dict):
                raise ValueError("Invalid event")
            kind = event.get("type")
            if kind == "stop":
                return
            if kind == "audio_end":
                await self.session.send_realtime_input(audio_stream_end=True)
            elif kind == "text":
                text = event.get("text")
                if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
                    raise ValueError("Enter 1 to 2000 characters")
                text = text.strip()
                await self.send({"type": "transcript", "role": "user", "text": text})
                await self.session.send_client_content(
                    turns=types.Content(role="user", parts=[types.Part(text=text)]),
                    turn_complete=True,
                )
            else:
                raise ValueError("Unsupported event")

    async def from_gemini(self):
        # receive() ends after a turn, so keep listening for subsequent turns.
        while True:
            received = False
            async for message in self.session.receive():
                received = True
                if message.go_away:
                    await self.send(
                        {
                            "type": "notice",
                            "text": "Gemini is closing this session. Start a new test call.",
                        }
                    )
                content = message.server_content
                if not content:
                    continue
                if content.interrupted:
                    await self.send({"type": "interrupted"})
                for role, transcript in (
                    ("user", content.input_transcription),
                    ("assistant", content.output_transcription),
                ):
                    if transcript and transcript.text:
                        await self.send(
                            {
                                "type": "transcript",
                                "role": role,
                                "text": transcript.text,
                            }
                        )
                if content.model_turn and not content.interrupted:
                    for part in content.model_turn.parts or []:
                        data = part.inline_data
                        if not data or not data.data:
                            continue
                        mime = data.mime_type or ""
                        if not mime.startswith("audio/pcm"):
                            raise ValueError("Expected PCM reply audio")
                        for option in mime.split(";")[1:]:
                            if (
                                option.strip().startswith("rate=")
                                and option.strip() != "rate=24000"
                            ):
                                raise ValueError("Expected 24 kHz reply audio")
                        await self.send(data.data)
                if content.turn_complete:
                    await self.send({"type": "turn_complete"})
            if not received:
                return

    async def run(self):
        tasks = [
            asyncio.create_task(self.from_browser()),
            asyncio.create_task(self.from_gemini()),
        ]
        try:
            done, _ = await asyncio.wait(
                tasks,
                timeout=300,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if not done:
                await self.send(
                    {
                        "type": "notice",
                        "text": "Five-minute test call ended. Start again to continue.",
                    }
                )
            for task in done:
                task.result()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


@app.websocket("/live")
async def live(socket: WebSocket):
    if socket.headers.get("origin") not in ORIGINS:
        await socket.close(code=1008)
        return

    await socket.accept()
    config = settings()
    try:
        if not config["key"] or config["key"] == "PASTE_YOUR_KEY_HERE":
            await socket.send_json(
                {
                    "type": "error",
                    "text": "Add GOOGLE_API_KEY to this test folder's .env.test file.",
                }
            )
            return

        start = await asyncio.wait_for(socket.receive_json(), timeout=15)
        if (
            not isinstance(start, dict)
            or start.get("type") != "start"
            or start.get("language") not in {"si", "en"}
        ):
            raise ValueError("Invalid session settings")
        language = (
            "Sinhala using Sinhala script" if start["language"] == "si" else "English"
        )

        live_config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=(
                "You are Jarvis in an isolated voice quality test. Reply briefly in "
                + language
                + ". Ask the user to repeat unclear speech. You have no access to "
                "SmartInventory, product data, a database, files or action tools. "
                "Never invent stock numbers or claim to create, update or delete "
                "products. If asked about inventory, explain that this is a voice-only "
                "test and the main application handles inventory."
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=config["voice"],
                    ),
                ),
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    silence_duration_ms=800,
                ),
            ),
        )
        client = genai.Client(
            api_key=config["key"],
            vertexai=False,
            http_options=types.HttpOptions(
                api_version="v1beta",
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        async with client.aio as aio:
            async with aio.live.connect(
                model=config["model"], config=live_config
            ) as session:
                bridge = VoiceTestBridge(socket, session)
                await bridge.send({"type": "ready"})
                await bridge.run()
    except WebSocketDisconnect:
        pass
    except Exception as error:
        safe_error = str(error)
        if config["key"]:
            safe_error = safe_error.replace(config["key"], "[hidden]")
        logger.error(
            "Gemini voice test %s: %s", type(error).__name__, safe_error[:1000]
        )
        with suppress(Exception):
            await socket.send_json(
                {
                    "type": "error",
                    "text": "Live test failed. Check the Python terminal for the model, key or quota error.",
                }
            )
    finally:
        with suppress(Exception):
            await socket.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001, ws_max_size=65536)

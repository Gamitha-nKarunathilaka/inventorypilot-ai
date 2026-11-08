"""Continuous microphone -> VAD -> Groq STT -> chat -> speech."""

import asyncio
import io
import json
import logging
import math
import os
import time
import wave

from collections import deque
from uuid import uuid4

import httpx
import webrtcvad

from fastapi import FastAPI, WebSocket, WebSocketDisconnect


log = logging.getLogger(__name__)

SUPPORTED_RATES = {8000, 16000, 32000, 48000}


class VoiceError(Exception):
    """An error that can be shown in the voice panel."""


class UtteranceDetector:
    """Detect speech using 30 ms PCM16 audio frames."""

    def __init__(
        self,
        sample_rate,
        silence_ms=900,
        max_seconds=20,
    ):
        if sample_rate not in SUPPORTED_RATES:
            raise ValueError("Unsupported microphone sample rate")

        self.rate = sample_rate
        self.frame_bytes = sample_rate * 30 // 1000 * 2
        self.end_frames = math.ceil(silence_ms / 30)
        self.max_frames = math.ceil(max_seconds * 1000 / 30)
        self.max_seconds = max_seconds

        self.vad = webrtcvad.Vad(2)
        self.pending = bytearray()

        self.reset()

    def reset(self):
        self.pre_roll = deque(maxlen=10)

        self.active = False
        self.audio = bytearray()

        self.voiced = 0
        self.run = 0
        self.quiet = 0
        self.frames = 0

        self.too_long = False

    def feed(self, packet):
        self.pending.extend(packet)
        events = []

        while len(self.pending) >= self.frame_bytes:
            frame = bytes(self.pending[:self.frame_bytes])
            del self.pending[:self.frame_bytes]

            voiced = self.vad.is_speech(frame, self.rate)

            if not self.active:
                self.pre_roll.append((frame, voiced))
                self.run = self.run + 1 if voiced else 0

                if self.run < 3:
                    continue

                self.active = True
                self.frames = len(self.pre_roll)

                self.voiced = sum(
                    flag for _, flag in self.pre_roll
                )

                self.audio.extend(
                    b"".join(
                        data for data, _ in self.pre_roll
                    )
                )

                events.append(("start", None))
                continue

            self.frames += 1
            self.voiced += int(voiced)
            self.quiet = 0 if voiced else self.quiet + 1

            if not self.too_long:
                self.audio.extend(frame)

                if self.frames >= self.max_frames:
                    self.too_long = True
                    self.audio.clear()

            if self.quiet >= self.end_frames:
                if self.too_long:
                    events.append(
                        (
                            "discard",
                            "Please use a shorter request, "
                            f"under {self.max_seconds} seconds.",
                        )
                    )

                elif self.voiced >= 8:
                    events.append(
                        ("utterance", bytes(self.audio))
                    )

                else:
                    events.append(
                        (
                            "discard",
                            "Speech was too brief. "
                            "Please say the request again.",
                        )
                    )

                self.reset()

        return events


def make_wav(pcm, sample_rate):
    """Wrap microphone PCM16 mono audio in a WAV file."""
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm)

    return buffer.getvalue()


def read_reply_pcm(audio):
    """Read mono PCM16 WAV audio at 24000 Hz."""
    if (
        not isinstance(audio, bytes)
        or len(audio) > 12_000_000
    ):
        raise ValueError("Invalid speech output")

    with wave.open(io.BytesIO(audio), "rb") as source:
        audio_format = (
            source.getnchannels(),
            source.getsampwidth(),
            source.getframerate(),
            source.getcomptype(),
        )

        if audio_format != (1, 2, 24000, "NONE"):
            raise ValueError(
                "Speech callback must return "
                "mono PCM16 WAV at 24000 Hz"
            )

        return source.readframes(source.getnframes())


class SpeechRateGate:
    """Space transcription requests within one Python process."""

    def __init__(self):
        self.lock = asyncio.Lock()
        self.next_slot = 0.0
        self.cooldown_until = 0.0

    async def acquire(self):
        async with self.lock:
            now = time.monotonic()

            if now < self.cooldown_until:
                wait = math.ceil(
                    self.cooldown_until - now
                )

                raise VoiceError(
                    "Speech service is rate-limited. "
                    f"Wait about {wait} seconds, "
                    "then speak again."
                )

            await asyncio.sleep(
                max(0, self.next_slot - now)
            )

            if time.monotonic() < self.cooldown_until:
                raise VoiceError(
                    "Speech service is rate-limited. "
                    "Try again later."
                )

            self.next_slot = time.monotonic() + 3.1

    def rate_limited(self, retry_after):
        try:
            seconds = float(retry_after)

            if not math.isfinite(seconds):
                raise ValueError()

        except (TypeError, ValueError):
            seconds = 60

        self.cooldown_until = (
            time.monotonic()
            + max(1, min(seconds, 3600))
        )


def transcription_prompt(language):
    """Build short vocabulary and spelling hints."""
    if language == "si":
        prompt = "භාණ්ඩ, තොග, මිල, ප්‍රමාණය, SKU"
        setting = "GROQ_STT_TERMS_SI"
    else:
        prompt = (
            "Inventory, stock, quantity, price, category, SKU"
        )
        setting = "GROQ_STT_TERMS_EN"

    for term in os.getenv(setting, "").split(","):
        term = " ".join(term.split())

        if not term:
            continue

        candidate = f"{prompt}, {term}"

        # Conservative size limit; preserve complete names.
        if len(candidate.encode("utf-8")) <= 224:
            prompt = candidate

    return prompt


async def transcribe_audio(
    client,
    api_key,
    pcm,
    rate,
    language,
    gate,
):
    await gate.acquire()

    response = await client.post(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        headers={
            "Authorization": f"Bearer {api_key}",
        },
        files={
            "file": (
                "utterance.wav",
                make_wav(pcm, rate),
                "audio/wav",
            ),
        },
        data={
            "model": (
                os.getenv("GROQ_STT_MODEL", "").strip()
                or "whisper-large-v3"
            ),
            "language": language,
            "prompt": transcription_prompt(language),
            "response_format": "verbose_json",
            "temperature": "0",
        },
    )

    if response.status_code == 429:
        gate.rate_limited(
            response.headers.get("retry-after")
        )

        raise VoiceError(
            "Groq speech quota was reached. "
            "Wait before speaking again; "
            "the request was not sent to inventory."
        )

    if response.status_code in {401, 403}:
        raise VoiceError(
            "Check GROQ_API_KEY and access "
            "to the selected Whisper model."
        )

    if response.status_code != 200:
        raise VoiceError(
            "Speech transcription failed "
            f"(HTTP {response.status_code}). "
            "No inventory request was sent."
        )

    data = response.json()

    if not isinstance(data, dict):
        raise VoiceError(
            "The speech service returned an unexpected response. "
            "No inventory request was sent."
        )

    text = data.get("text", "")

    if (
        not isinstance(text, str)
        or not 1 <= len(text.strip()) <= 1900
    ):
        raise VoiceError(
            "Could not understand a complete request. "
            "Please try a shorter sentence."
        )

    segments = data.get("segments") or []

    if not isinstance(segments, list) or any(
        not isinstance(item, dict)
        for item in segments
    ):
        raise VoiceError(
            "The speech service returned invalid speech details. "
            "Please try again."
        )

    if segments:
        try:
            no_speech_probabilities = [
                float(item.get("no_speech_prob", 0))
                for item in segments
            ]

            log_probabilities = [
                float(item.get("avg_logprob", 0))
                for item in segments
            ]

        except (TypeError, ValueError):
            raise VoiceError(
                "Could not check speech confidence. "
                "Please say the request again."
            ) from None

        if not all(
            math.isfinite(value)
            for value in (
                no_speech_probabilities + log_probabilities
            )
        ):
            raise VoiceError(
                "Could not check speech confidence. "
                "Please say the request again."
            )

        if all(
            probability > 0.6
            for probability in no_speech_probabilities
        ):
            raise VoiceError(
                "That sounded like background noise. "
                "Please say the request again."
            )

        average_log_probability = (
            sum(log_probabilities)
            / len(log_probabilities)
        )

        if average_log_probability < -1.0:
            raise VoiceError(
                "Speech was unclear. Please repeat "
                "the product name or SKU and quantity."
            )

    return text.strip()


def unpack_response(response):
    status = getattr(response, "status_code", 200)

    body = (
        json.loads(response.body)
        if hasattr(response, "body")
        else response
    )

    if (
        status != 200
        or not isinstance(body, dict)
        or not isinstance(body.get("reply"), str)
    ):
        return {
            "ok": False,
            "reply": (
                "Could not confirm the result. "
                "Check current inventory before "
                "repeating the request."
            ),
            "inventory_changed": False,
        }

    return {
        "ok": True,
        "reply": body["reply"],
        "inventory_changed": (
            body.get("inventory_changed") is True
        ),
    }


def mount_groq_voice(
    app: FastAPI,
    chat_handler,
    speech_handler,
):
    """
    chat_handler(dict): synchronous function.
    speech_handler(text): async function returning WAV bytes.
    """
    gate = SpeechRateGate()
    background = set()

    @app.websocket("/voice/groq")
    async def groq_voice(websocket: WebSocket):
        origins = {
            item.strip()
            for item in os.getenv(
                "LIVE_ALLOWED_ORIGINS",
                "http://localhost:5173,"
                "http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        }

        if websocket.headers.get("origin") not in origins:
            await websocket.close(code=1008)
            return

        await websocket.accept()

        connected = True
        generation = 0

        send_lock = asyncio.Lock()
        queue = asyncio.Queue(maxsize=1)

        speech_task = None
        session_id = str(uuid4())
        workers = []

        async def emit(payload):
            if not connected:
                return

            async with send_lock:
                try:
                    if isinstance(payload, bytes):
                        await websocket.send_bytes(payload)
                    else:
                        await websocket.send_json(payload)

                except (
                    WebSocketDisconnect,
                    RuntimeError,
                    OSError,
                ):
                    pass

        async def invoke_chat(question, request_id):
            await emit({"type": "tool_started"})

            try:
                response = await asyncio.to_thread(
                    chat_handler,
                    {
                        "session_id": session_id,
                        "request_id": request_id,
                        "message": question,
                    },
                )

                result = unpack_response(response)

            except Exception as error:
                log.warning(
                    "Groq voice chat callback failed: %s",
                    type(error).__name__,
                )

                result = unpack_response(None)

            # Report completed work even after a voice interruption.
            await emit({
                "type": "tool_finished",
                **result,
            })

            return result

        async def speak_reply(text, epoch):
            audio = await asyncio.wait_for(
                speech_handler(text[:5000]),
                timeout=45,
            )

            pcm = read_reply_pcm(audio)
            started = time.monotonic()

            # 4800 bytes = 100 ms of mono PCM16 at 24000 Hz.
            for offset in range(0, len(pcm), 4800):
                if (
                    not connected
                    or epoch != generation
                ):
                    return

                chunk = pcm[offset:offset + 4800]
                await emit(chunk)

                target = (
                    started
                    + (offset + len(chunk)) / 48000
                    - 0.3
                )

                await asyncio.sleep(
                    max(0, target - time.monotonic())
                )

        try:
            hello = await asyncio.wait_for(
                websocket.receive_json(),
                timeout=15,
            )

            if not isinstance(hello, dict):
                raise VoiceError(
                    "Invalid live voice start message."
                )

            rate = hello.get("sample_rate")

            if (
                hello.get("type") != "start"
                or type(rate) is not int
                or rate not in SUPPORTED_RATES
            ):
                raise VoiceError(
                    "Live voice needs 8, 16, 32 or "
                    "48 kHz microphone audio. "
                    "Try Chrome or Edge."
                )

            language = (
                "en"
                if hello.get("language") == "en"
                else "si"
            )

            key = os.getenv("GROQ_API_KEY", "").strip()

            if not key or key in {
                "YOUR_GROQ_API_KEY",
                "YOUR_REAL_GROQ_KEY",
            }:
                raise VoiceError(
                    "Add GROQ_API_KEY to the Python "
                    "agent .env and restart Python."
                )

            try:
                configured_silence = int(
                    os.getenv("VOICE_SILENCE_MS", "900")
                )
            except ValueError:
                raise VoiceError(
                    "VOICE_SILENCE_MS must be a number, "
                    "for example 1400."
                ) from None

            silence = max(
                600,
                min(1800, configured_silence),
            )

            detector = UtteranceDetector(
                rate,
                silence_ms=silence,
            )

            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30, connect=10)
            ) as client:
                await emit({"type": "ready"})

                async def microphone():
                    nonlocal generation, speech_task

                    while True:
                        message = await websocket.receive()

                        if (
                            message["type"]
                            == "websocket.disconnect"
                        ):
                            return

                        packet = message.get("bytes")

                        if packet is None:
                            if message.get("text"):
                                command = json.loads(
                                    message["text"]
                                )

                                if not isinstance(command, dict):
                                    raise VoiceError(
                                        "Invalid voice command."
                                    )

                                if command.get("type") == "stop":
                                    return

                            continue

                        if (
                            not packet
                            or len(packet) % 2
                            or len(packet) > 32768
                        ):
                            raise VoiceError(
                                "Invalid microphone packet."
                            )

                        for kind, value in detector.feed(packet):
                            if kind == "start":
                                generation += 1

                                if (
                                    speech_task
                                    and not speech_task.done()
                                ):
                                    speech_task.cancel()

                                await emit({
                                    "type": "interrupted",
                                })

                                await emit({
                                    "type": "user_speaking",
                                    "active": True,
                                })

                            else:
                                await emit({
                                    "type": "user_speaking",
                                    "active": False,
                                })

                                if kind == "discard":
                                    await emit({
                                        "type": "notice",
                                        "message": value,
                                    })

                                elif queue.full():
                                    await emit({
                                        "type": "notice",
                                        "message": (
                                            "An earlier request "
                                            "is still waiting. "
                                            "Please repeat this "
                                            "request after its result."
                                        ),
                                    })

                                else:
                                    queue.put_nowait(
                                        (
                                            value,
                                            generation,
                                            str(uuid4()),
                                        )
                                    )

                async def process_utterances():
                    nonlocal speech_task

                    while True:
                        pcm, epoch, request_id = await queue.get()

                        try:
                            if epoch != generation:
                                await emit({
                                    "type": "notice",
                                    "message": (
                                        "An unfinished voice request "
                                        "was replaced by newer speech; "
                                        "it was not sent to inventory."
                                    ),
                                })
                                continue

                            await emit({
                                "type": "processing_started",
                            })

                            question = await transcribe_audio(
                                client,
                                key,
                                pcm,
                                rate,
                                language,
                                gate,
                            )

                            await emit({
                                "type": "transcript",
                                "role": "user",
                                "text": question,
                            })

                            if (
                                epoch != generation
                                or not connected
                            ):
                                await emit({
                                    "type": "notice",
                                    "message": (
                                        "That voice request was "
                                        "interrupted before it "
                                        "was sent to inventory."
                                    ),
                                })
                                continue

                            message = (
                                question
                                if language == "si"
                                else (
                                    "Please reply in English.\n"
                                    + question
                                )
                            )

                            task = asyncio.create_task(
                                invoke_chat(message, request_id)
                            )

                            background.add(task)
                            task.add_done_callback(
                                background.discard
                            )

                            # Let submitted inventory work finish.
                            result = await asyncio.shield(task)

                            if (
                                epoch != generation
                                or not connected
                            ):
                                continue

                            if not result["ok"]:
                                await emit({
                                    "type": "notice",
                                    "message": result["reply"],
                                })
                                continue

                            speech_task = asyncio.create_task(
                                speak_reply(
                                    result["reply"],
                                    epoch,
                                )
                            )

                            try:
                                await speech_task

                            except asyncio.CancelledError:
                                if not connected:
                                    raise

                            except Exception as error:
                                log.warning(
                                    "Existing speech callback failed: %s",
                                    type(error).__name__,
                                )

                                await emit({
                                    "type": "notice",
                                    "message": (
                                        "The reply is available "
                                        "as text. Voice playback "
                                        "failed; no inventory "
                                        "request was repeated."
                                    ),
                                })

                            finally:
                                speech_task = None

                        except VoiceError as error:
                            await emit({
                                "type": "notice",
                                "message": str(error),
                            })

                        except (
                            httpx.HTTPError,
                            ValueError,
                            TypeError,
                        ) as error:
                            log.warning(
                                "Groq transcription failed: %s",
                                type(error).__name__,
                            )

                            await emit({
                                "type": "notice",
                                "message": (
                                    "Could not transcribe the audio. "
                                    "No inventory request was sent."
                                ),
                            })

                        finally:
                            queue.task_done()

                            await emit({
                                "type": "processing_finished",
                            })

                            await emit({
                                "type": "turn_complete",
                            })

                workers = [
                    asyncio.create_task(microphone()),
                    asyncio.create_task(process_utterances()),
                ]

                done, _ = await asyncio.wait(
                    workers,
                    timeout=540,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if not done:
                    await emit({
                        "type": "notice",
                        "message": (
                            "Nine-minute voice session ended. "
                            "Start live again to continue."
                        ),
                    })

                for task in done:
                    task.result()

        except WebSocketDisconnect:
            pass

        except VoiceError as error:
            await emit({
                "type": "error",
                "message": str(error),
            })

        except Exception as error:
            log.warning(
                "Groq voice connection failed: %s",
                type(error).__name__,
            )

            await emit({
                "type": "error",
                "message": (
                    "Voice connection failed. "
                    "Check the Python terminal. "
                    "No request was automatically retried."
                ),
            })

        finally:
            connected = False

            if speech_task:
                speech_task.cancel()

            for task in workers:
                task.cancel()

            cleanup_tasks = list(workers)

            if speech_task:
                cleanup_tasks.append(speech_task)

            await asyncio.gather(
                *cleanup_tasks,
                return_exceptions=True,
            )

            try:
                await websocket.close()
            except (RuntimeError, OSError):
                pass
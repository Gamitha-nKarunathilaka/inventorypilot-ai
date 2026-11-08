import asyncio
import io
import os
import sys
import wave
from array import array

import edge_tts
import miniaudio

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter()

SAMPLE_RATE = 24000

# Shorten quiet internal pauses of at least 0.8 seconds.
MIN_PAUSE_SECONDS = 0.8

# Keep 0.4 seconds of each long pause.
KEEP_PAUSE_SECONDS = 0.4


class SpeechRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(
        min_length=1,
        max_length=5000,
    )


def shorten_long_pauses(
    samples: array,
    sample_rate: int,
) -> array:
    frame_size = max(1, sample_rate // 100)

    minimum_pause = round(
        MIN_PAUSE_SECONDS * sample_rate
    )

    keep_pause = round(
        KEEP_PAUSE_SECONDS * sample_rate
    )

    # Use both checks to distinguish very quiet gaps.
    rms_limit = 32768 * 10 ** (-50 / 20)
    peak_limit = 32768 * 10 ** (-40 / 20)

    output = array("h")

    cursor = 0
    silence_start = None

    # An empty final block closes the last quiet interval.
    for offset in range(
        0,
        len(samples) + frame_size,
        frame_size,
    ):
        block = samples[offset:offset + frame_size]

        quiet = (
            bool(block)
            and max(abs(value) for value in block)
            < peak_limit
            and sum(value * value for value in block)
            / len(block)
            < rms_limit * rms_limit
        )

        if quiet:
            if silence_start is None:
                silence_start = offset

            continue

        if silence_start is None:
            continue

        silence_end = min(offset, len(samples))
        duration = silence_end - silence_start

        if (
            silence_start > 0
            and silence_end < len(samples)
            and duration >= minimum_pause
        ):
            left_keep = keep_pause // 2
            right_keep = keep_pause - left_keep

            cut_start = silence_start + left_keep
            cut_end = silence_end - right_keep

            output.extend(
                samples[cursor:cut_start]
            )

            cursor = cut_end

        silence_start = None

    output.extend(samples[cursor:])

    return output


def make_smooth_wav(mp3_audio: bytes) -> bytes:
    decoded = miniaudio.decode(
        mp3_audio,
        output_format=miniaudio.SampleFormat.SIGNED16,
        nchannels=1,
        sample_rate=SAMPLE_RATE,
    )

    if not decoded.samples:
        raise ValueError(
            "No decoded audio samples."
        )

    samples = shorten_long_pauses(
        decoded.samples,
        SAMPLE_RATE,
    )

    # WAV PCM samples use little-endian byte order.
    if sys.byteorder != "little":
        samples.byteswap()

    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(samples.tobytes())

    return buffer.getvalue()


async def create_mp3(text: str) -> bytes:
    communicator = edge_tts.Communicate(
        text=text,

        voice=(
            os.getenv("TTS_VOICE", "").strip()
            or "si-LK-SameeraNeural"
        ),

        rate=(
            os.getenv("TTS_RATE", "").strip()
            or "-8%"
        ),

        pitch=(
            os.getenv("TTS_PITCH", "").strip()
            or "+0Hz"
        ),

        volume=(
            os.getenv("TTS_VOLUME", "").strip()
            or "+0%"
        ),
    )

    audio = bytearray()

    async for chunk in communicator.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])

            if len(audio) > 10_000_000:
                raise ValueError(
                    "Audio response is too large."
                )

    if not audio:
        raise ValueError(
            "No audio was returned."
        )

    return bytes(audio)


async def create_speech(text: str) -> bytes:
    mp3_audio = await create_mp3(text)

    # Process audio outside the API's event loop.
    return await asyncio.to_thread(
        make_smooth_wav,
        mp3_audio,
    )


@router.post("/speech")
async def speech(payload: SpeechRequest):
    try:
        audio = await asyncio.wait_for(
            create_speech(payload.text),
            timeout=40,
        )

    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=(
                "හඬ සකස් කිරීමට වැඩි කාලයක් ගත වුණා. "
                "නැවත උත්සාහ කරන්න."
            ),
        ) from None

    except Exception as error:
        print(
            "Speech error:",
            type(error).__name__,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "හඬ ලබාගන්න බැරි වුණා. "
                "Python terminal එකේ error එක බලන්න."
            ),
        ) from None

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
        },
    )
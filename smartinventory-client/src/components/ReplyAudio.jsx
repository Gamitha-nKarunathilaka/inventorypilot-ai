import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  enableVoiceSound,
  getVoiceContext,
  playVoiceBuffer,
} from "../lib/voiceAudio.js";

export default function ReplyAudio({
  text,
  disabled,
  onPhaseChange,
}) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const requestRef = useRef(null);
  const bufferRef = useRef(null);
  const stopRef = useRef(null);
  const aliveRef = useRef(false);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const beginPlayback = useCallback(
    (buffer) => {
      if (
        !aliveRef.current ||
        disabledRef.current ||
        !buffer
      ) {
        return;
      }

      stopRef.current?.();
      stopRef.current = null;
      setError("");

      try {
        stopRef.current = playVoiceBuffer(
          buffer,
          () => {
            stopRef.current = null;

            if (aliveRef.current) {
              setPlaying(false);
              onPhaseChange("idle");
            }
          }
        );

        setPlaying(true);
        onPhaseChange("speaking");
      } catch (err) {
        setPlaying(false);
        onPhaseChange("idle");

        setError(
          err.message ||
            "හඬ ඇරඹීමට Play voice ඔබන්න."
        );
      }
    },
    [onPhaseChange]
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    requestRef.current = controller;
    bufferRef.current = null;

    setLoading(true);
    setReady(false);
    setPlaying(false);
    setError("");
    onPhaseChange("loading");

    const timer = setTimeout(
      () => controller.abort(),
      50000
    );

    async function loadAudio() {
      try {
        const response = await fetch("/agent/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => null);

          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : `Speech API error: HTTP ${response.status}`
          );
        }

        if (
          !response.headers
            .get("Content-Type")
            ?.startsWith("audio/")
        ) {
          throw new Error(
            "Speech API එකෙන් audio ලැබුණේ නැහැ."
          );
        }

        const bytes = await response.arrayBuffer();

        if (
          !active ||
          requestRef.current !== controller ||
          controller.signal.aborted
        ) {
          return;
        }

        const buffer =
          await getVoiceContext().decodeAudioData(bytes);

        if (
          !active ||
          requestRef.current !== controller ||
          controller.signal.aborted
        ) {
          return;
        }

        bufferRef.current = buffer;
        requestRef.current = null;

        setReady(true);
        setLoading(false);
        onPhaseChange("idle");

        beginPlayback(buffer);
      } catch (err) {
        if (
          !active ||
          requestRef.current !== controller
        ) {
          return;
        }

        setError(
          err.name === "AbortError"
            ? "හඬ ලබාගැනීමේ කාලය ඉක්මවා ගියා."
            : err.message || "හඬ ලබාගන්න බැරි වුණා."
        );
      } finally {
        clearTimeout(timer);

        if (
          active &&
          requestRef.current === controller
        ) {
          requestRef.current = null;
          setLoading(false);
          onPhaseChange("idle");
        }
      }
    }

    loadAudio();

    return () => {
      active = false;

      controller.abort();
      clearTimeout(timer);

      if (requestRef.current === controller) {
        requestRef.current = null;
      }

      stopRef.current?.();
      stopRef.current = null;
      bufferRef.current = null;
    };
  }, [text, attempt, onPhaseChange, beginPlayback]);

  function stopAudio() {
    requestRef.current?.abort();
    requestRef.current = null;

    stopRef.current?.();
    stopRef.current = null;

    setLoading(false);
    setPlaying(false);
    onPhaseChange("idle");
  }

  async function replay() {
    if (disabled || loading || stopRef.current) return;

    const buffer = bufferRef.current;

    try {
      await enableVoiceSound();

      if (
        aliveRef.current &&
        buffer === bufferRef.current
      ) {
        beginPlayback(buffer);
      }
    } catch (err) {
      if (aliveRef.current) {
        setError(
          err.message || "Audio playback අවහිර වී ඇත."
        );
      }
    }
  }

  return (
    <div className="border-t border-cyan-900/40 bg-cyan-950/20 p-4">
      <p
        role="status"
        className="text-sm text-cyan-200"
      >
        {loading
          ? "හඬ සකස් කරමින්…"
          : playing
            ? "Jarvis is speaking…"
            : "Jarvis · Voice reply"}
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        {ready && (
          <button
            type="button"
            onClick={replay}
            disabled={disabled || loading || playing}
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            Play voice
          </button>
        )}

        {(loading || playing) && (
          <button
            type="button"
            onClick={stopAudio}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm"
          >
            Stop voice
          </button>
        )}

        {!ready && !loading && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setAttempt((previous) => previous + 1)
            }
            className="rounded-lg border border-cyan-700 px-4 py-2 text-sm disabled:opacity-40"
          >
            Retry voice
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 text-sm text-amber-200"
        >
          {error}
        </p>
      )}
    </div>
  );
}
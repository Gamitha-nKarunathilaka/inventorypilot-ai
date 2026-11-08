import { useEffect, useRef, useState } from "react";

import { LiveAudio } from "../lib/liveAudio.js";

import "../styles/live-voice.css";

export function VoiceModeSwitch({
  mode,
  onChange,
  busy,
}) {
  return (
    <div
      className="jlv-mode"
      role="group"
      aria-label="Assistant mode"
    >
      {[
        ["chat", "Chat & voice"],
        ["live", "Live voice"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          disabled={busy && value !== mode}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function LiveVoicePanel({
  onStatusChange,
  onInventoryChanged,
}) {
  const connection = useRef(null);
  const mounted = useRef(false);
  const logRef = useRef(null);
  const newBubble = useRef(true);

  const callbacks = useRef({
    onStatusChange,
    onInventoryChanged,
  });

  callbacks.current = {
    onStatusChange,
    onInventoryChanged,
  };

  const [phase, setPhase] = useState("idle");
  const [language, setLanguage] = useState("si");
  const [provider, setProvider] = useState("groq");

  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      connection.current?.stop();
      connection.current = null;
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop =
        logRef.current.scrollHeight;
    }
  }, [messages]);

  function handleEvent(event) {
    if (!mounted.current) {
      return;
    }

    if (event.type === "transcript") {
      const forceNew = newBubble.current;
      newBubble.current = false;

      setMessages((previous) => {
        const last = previous.at(-1);

        if (
          !forceNew &&
          last?.role === event.role
        ) {
          return [
            ...previous.slice(0, -1),
            {
              ...last,
              text: (
                last.text + event.text
              ).slice(-8000),
            },
          ];
        }

        return [
          ...previous.slice(-39),
          {
            role: event.role,
            text: event.text,
          },
        ];
      });
    } else if (
      event.type === "turn_complete" ||
      event.type === "interrupted"
    ) {
      newBubble.current = true;
    } else if (
      event.type === "tool_finished"
    ) {
      setMessages((previous) => [
        ...previous.slice(-39),
        {
          role: "result",
          text: event.reply,
        },
      ]);

      newBubble.current = true;

      if (event.inventory_changed === true) {
        callbacks.current.onInventoryChanged?.();
      }
    } else if (event.type === "notice") {
      setNotice(event.message);
    }
  }

  function start() {
    if (connection.current) {
      return;
    }

    setError("");
    setNotice("");
    setMessages([]);

    newBubble.current = true;

    const audio = new LiveAudio({
      provider,

      onEvent: handleEvent,

      onPhase: (next) => {
        if (!mounted.current) {
          return;
        }

        setPhase(next);

        callbacks.current.onStatusChange?.(
          next === "connecting"
            ? "thinking"
            : next
        );

        if (
          next === "idle" &&
          connection.current === audio
        ) {
          connection.current = null;
        }
      },

      onError: (message) => {
        if (mounted.current) {
          setError(message);
        }
      },
    });

    connection.current = audio;

    void audio.start(language);
  }

  const labels = {
    idle: "Ready to connect",
    connecting: "Connecting…",
    listening: "Microphone on",
    thinking: "Working…",
    speaking: "Jarvis is speaking",
  };

  return (
    <section
      className="jlv-panel"
      aria-label="Jarvis live voice"
    >
      <div className="jlv-heading">
        <strong>Live conversation</strong>

        <span
          className={
            phase !== "idle"
              ? "jlv-status is-active"
              : "jlv-status"
          }
          role="status"
        >
          {labels[phase]}
        </span>
      </div>

      <p className="jlv-help">
        Start once, then speak naturally.
        You can interrupt Jarvis while he replies.
      </p>

      <div className="jlv-controls">
        <label>
          <span className="jlv-sr-only">
            Voice service
          </span>

          <select
            value={provider}
            disabled={phase !== "idle"}
            onChange={(event) => {
              setProvider(event.target.value);
            }}
          >
            <option value="groq">
              Groq + Sinhala voice
            </option>

            <option value="gemini">
              Gemini Live
            </option>
          </select>
        </label>

        <label>
          <span className="jlv-sr-only">
            Speaking language
          </span>

          <select
            value={language}
            disabled={phase !== "idle"}
            onChange={(event) => {
              setLanguage(event.target.value);
            }}
          >
            <option value="si">සිංහල</option>
            <option value="en">English</option>
          </select>
        </label>

        <button
          type="button"
          className="jlv-start"
          disabled={phase !== "idle"}
          onClick={start}
        >
          Start live
        </button>

        <button
          type="button"
          disabled={phase === "idle"}
          onClick={() => {
            connection.current?.stop();
          }}
        >
          End live
        </button>
      </div>

      <p className="jlv-help">
        {provider === "groq"
          ? "Pause briefly after each request. Completed speech goes to Groq, and Jarvis uses your existing voice to reply."
          : "Microphone audio streams to Gemini until you end the session."}
        {" "}
        Headphones help prevent echo.
      </p>

      {error && (
        <p
          role="alert"
          className="jlv-error"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="jlv-notice"
        >
          {notice}
        </p>
      )}

      <div
        ref={logRef}
        className="jlv-messages"
        aria-label="Live conversation transcript"
      >
        {messages.length === 0 && (
          <p className="jlv-empty">
            Try: “What products are low in stock?”
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              `jlv-message jlv-message--${message.role}`
            }
          >
            <span>
              {message.role === "user"
                ? "You"
                : message.role === "result"
                  ? "Inventory result"
                  : "Jarvis"}
            </span>

            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <p className="jlv-footer">
        Live sessions have separate conversation
        history from chat.
      </p>
    </section>
  );
}
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { enableVoiceSound } from "../lib/voiceAudio.js";

function VoiceIcon({ name }) {
  const paths = {
    mic:
      "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z" +
      "M6 11v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8",

    stop: "M6 6h12v12H6z",

    cancel: "m6 6 12 12M18 6 6 18",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function releaseRecognition(recognition) {
  if (!recognition) {
    return;
  }

  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;

  try {
    recognition.abort();
  } catch {
    // Recognition may already have stopped.
  }
}

export default function VoiceControls({
  phase,
  onPhaseChange,
  onTranscript,
  disabled = false,
}) {
  const recognitionRef = useRef(null);

  const [language, setLanguage] = useState("si-LK");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;

      recognitionRef.current = null;

      releaseRecognition(recognition);
    };
  }, []);

  function startListening() {
    if (disabled || recognitionRef.current) {
      return;
    }

    setError("");

    // Unlock reply audio from this user interaction.
    void enableVoiceSound().catch(() => {});

    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "මේ browser එකේ voice input නැහැ. ප්‍රශ්නය type කරන්න."
      );

      return;
    }

    if (!window.isSecureContext) {
      setError(
        "Microphone සඳහා localhost හෝ HTTPS භාවිත කරන්න."
      );

      return;
    }

    let recognition;

    function finish() {
      if (recognitionRef.current !== recognition) {
        return;
      }

      recognitionRef.current = null;

      releaseRecognition(recognition);

      onPhaseChange("idle");
    }

    try {
      recognition = new Recognition();

      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (recognitionRef.current === recognition) {
          onPhaseChange("listening");
        }
      };

      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition) {
          return;
        }

        const parts = [];

        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index];

          if (result.isFinal) {
            parts.push(result[0].transcript);
          }
        }

        const text = parts.join(" ").trim();

        if (text) {
          // Stop recognition before sending the question.
          finish();
          onTranscript(text);
        }
      };

      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) {
          return;
        }

        const messages = {
          "not-allowed":
            "Microphone permission ලබා දෙන්න.",

          "audio-capture":
            "Microphone එක හඳුනාගන්න බැහැ.",

          "no-speech":
            "හඬක් ඇසුණේ නැහැ. නැවත Speak කරන්න.",

          network:
            "Speech service එකට connect වෙන්න බැහැ. Internet connection එක බලන්න.",

          "language-not-supported":
            "මේ speech service එක තෝරාගත් භාෂාවට සහාය නොදක්වයි. ප්‍රශ්නය type කරන්න.",

          "service-not-allowed":
            "Browser එක speech service එකට අවසර දෙන්නේ නැහැ. ප්‍රශ්නය type කරන්න.",

          aborted:
            "Voice input නතර වුණා. අවශ්‍ය නම් නැවත Speak කරන්න.",
        };

        setError(
          messages[event.error] ||
            `Voice error: ${event.error}`
        );

        finish();
      };

      recognition.onend = () => {
        if (recognitionRef.current !== recognition) {
          return;
        }

        setError(
          "වචන හඳුනාගත්තේ නැහැ. නැවත Speak කරන්න හෝ type කරන්න."
        );

        finish();
      };

      recognitionRef.current = recognition;

      onPhaseChange("starting");

      recognition.start();
    } catch {
      recognitionRef.current = null;

      releaseRecognition(recognition);

      onPhaseChange("idle");

      setError(
        "Microphone එක ආරම්භ කරන්න බැරි වුණා."
      );
    }
  }

  function stopListening() {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    try {
      onPhaseChange("processing");

      recognition.stop();
    } catch {
      cancelListening();

      setError(
        "Voice input නතර වුණා. නැවත උත්සාහ කරන්න."
      );
    }
  }

  function cancelListening() {
    const recognition = recognitionRef.current;

    recognitionRef.current = null;

    releaseRecognition(recognition);

    onPhaseChange("idle");
    setError("");
  }

  const statusText = {
    idle: "Ready",
    starting: "Starting microphone…",
    listening: "Listening…",
    processing: "Processing speech…",
  };

  return (
    <div
      className="jcp-voice"
      data-phase={phase}
    >
      <div className="jcp-buttons">
        <button
          type="button"
          onClick={cancelListening}
          disabled={phase === "idle"}
          title="කියූ ප්‍රශ්නය යැවීම අවලංගු කරන්න"
          className="jcp-action"
        >
          <span className="jcp-button-circle">
            <VoiceIcon name="cancel" />
          </span>

          <span>Cancel</span>
        </button>

        <button
          type="button"
          onClick={startListening}
          disabled={disabled || phase !== "idle"}
          className="jcp-action jcp-speak"
        >
          <span className="jcp-button-circle">
            <VoiceIcon name="mic" />
          </span>

          <span>
            {phase === "listening"
              ? "Listening"
              : "Speak"}
          </span>
        </button>

        <button
          type="button"
          onClick={stopListening}
          disabled={phase !== "listening"}
          title="කතා කිරීම අවසන් කර ප්‍රශ්නය යවන්න"
          className="jcp-action"
        >
          <span className="jcp-button-circle">
            <VoiceIcon name="stop" />
          </span>

          <span>Stop mic</span>
        </button>
      </div>

      <div className="jcp-voice-options">
        <label>
          Language

          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value)
            }
            disabled={disabled || phase !== "idle"}
          >
            <option value="si-LK">
              සිංහල
            </option>

            <option value="en-US">
              English
            </option>
          </select>
        </label>

        <span role="status">
          {disabled
            ? "Jarvis is busy…"
            : statusText[phase]}
        </span>
      </div>

      <p className="jcp-hint">
        කතා කර අවසන් වූ පසු ප්‍රශ්නය ස්වයංක්‍රීයව
        Jarvisට යවයි.
      </p>

      {error && (
        <p
          role="alert"
          className="jcp-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
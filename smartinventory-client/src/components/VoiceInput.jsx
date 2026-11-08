import { useEffect, useRef, useState } from "react";

export default function VoiceInput({
  onAsk,
  thinking = false,
}) {
  const recognitionRef = useRef(null);

  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("si-LK");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;

      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;

        recognition.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  function startListening() {
    if (thinking || recognitionRef.current) {
      return;
    }

    setError("");

    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        "Speech recognition is unavailable in this browser. You can type your question."
      );
      return;
    }

    try {
      const recognition = new Recognition();

      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setPhase("listening");
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
      };

      recognition.onerror = (event) => {
        const messages = {
          "not-allowed":
            "Microphone permission was denied. Allow microphone access to use voice input.",
          "audio-capture":
            "No microphone is available.",
          "no-speech":
            "No speech was detected. Please try again.",
          network:
            "The speech service could not be reached. Check your internet connection.",
          "language-not-supported":
            "This speech service does not support the selected language. You can type your question.",
        };

        setError(
          messages[event.error] ||
            `Speech recognition failed: ${event.error}`
        );
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          setPhase("idle");
        }
      };

      recognitionRef.current = recognition;
      setPhase("starting");
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setPhase("idle");
      setError("Could not start speech recognition.");
    }
  }

  function stopListening() {
    const recognition = recognitionRef.current;

    if (recognition && phase === "listening") {
      setPhase("processing");
      recognition.stop();
    }
  }

  function handleAsk() {
    const question = message.trim();

    if (
      typeof onAsk !== "function" ||
      thinking ||
      phase !== "idle" ||
      !question
    ) {
      return;
    }

    if (question.length > 2000) {
      setError(
        "Please keep your question under 2,000 characters."
      );
      return;
    }

    setError("");
    onAsk(question);
  }

  const statusText = {
    idle: "Ready",
    starting: "Starting microphone...",
    listening: "Listening...",
    processing: "Processing speech...",
  };

  const cannotAsk =
    typeof onAsk !== "function" ||
    thinking ||
    phase !== "idle" ||
    !message.trim();

  return (
    <section className="mb-6 rounded-2xl bg-slate-900 p-6 text-white">
      <h3 className="text-xl font-semibold">
        Jarvis · Inventory Assistant
      </h3>

      <p className="mt-2 text-sm text-slate-300">
        Speak or type your inventory question, then click Ask Jarvis.
      </p>

      <label
        htmlFor="voice-language"
        className="mt-5 block text-sm font-medium"
      >
        Speaking language
      </label>

      <select
        id="voice-language"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        disabled={thinking || phase !== "idle"}
        className="mt-2 rounded-lg bg-white px-3 py-2 text-slate-900 disabled:opacity-50"
      >
        <option value="si-LK">සිංහල</option>
        <option value="en-US">English</option>
      </select>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startListening}
          disabled={thinking || phase !== "idle"}
          className="rounded-lg bg-blue-600 px-5 py-2 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Speak
        </button>

        <button
          type="button"
          onClick={stopListening}
          disabled={phase !== "listening"}
          className="rounded-lg bg-slate-700 px-5 py-2 font-medium hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Stop
        </button>

        <span
          role="status"
          className="text-sm text-blue-300"
        >
          {thinking ? "Thinking..." : statusText[phase]}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      <label
        htmlFor="voice-question"
        className="mt-5 block text-sm font-medium"
      >
        Your question
      </label>

      <textarea
        id="voice-question"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        maxLength={2000}
        disabled={thinking || phase !== "idle"}
        placeholder="Blue Pen stock කීයද?"
        className="mt-2 w-full rounded-lg bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={handleAsk}
        disabled={cannotAsk}
        className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {thinking ? "Thinking..." : "Ask Jarvis"}
      </button>
    </section>
  );
}
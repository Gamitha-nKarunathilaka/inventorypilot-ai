import { useEffect, useId, useRef, useState } from "react";
import JarvisControlPanel from "./JarvisControlPanel.jsx";
import { GeminiLiveAudio } from "../lib/geminiLiveAudio.js";

const fields = {
  product_id: "Product ID",
  expected_sku: "Current SKU",
  name: "Name",
  sku: "SKU",
  category_id: "Category ID",
  price: "Price (LKR)",
  quantity: "Final quantity",
  reorder_level: "Reorder level",
};

export default function GeminiLivePanel({
  showHead = false,
  onInventoryChanged,
}) {
  const id = useId();
  const audioRef = useRef(null);
  const callbackRef = useRef(onInventoryChanged);
  const transcriptIds = useRef({});
  const writingRef = useRef(false);
  const mountedRef = useRef(false);
  const logRef = useRef(null);
  const [connection, setConnection] = useState("idle");
  const [status, setStatus] = useState("idle");
  const [language, setLanguage] = useState("si");
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [approval, setApproval] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    callbackRef.current = onInventoryChanged;
  }, [onInventoryChanged]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, approval]);

  function addTranscript(role, text) {
    const messageId = transcriptIds.current[role] || crypto.randomUUID();
    transcriptIds.current[role] = messageId;
    setMessages((previous) => {
      const found = previous.some((message) => message.id === messageId);
      if (found)
        return previous.map((message) =>
          message.id === messageId
            ? { ...message, text: (message.text + text).slice(-12000) }
            : message,
        );
      return [...previous, { id: messageId, role, text }].slice(-60);
    });
  }

  function handleEvent(event) {
    if (!mountedRef.current) return;
    if (event.type === "ready") {
      setConnection("connected");
      setStatus("listening");
      setNotice("Connected. Speak naturally; you can interrupt Jarvis.");
    } else if (event.type === "transcript") {
      addTranscript(event.role, event.text);
    } else if (event.type === "working") {
      setStatus("thinking");
      if (
        ["create_product", "update_product", "delete_product"].includes(
          event.operation,
        )
      ) {
        writingRef.current = true;
        setWriting(true);
      }
    } else if (event.type === "approval") {
      setApproval(event);
      setStatus("idle");
    } else if (event.type === "approval_closed") {
      setApproval((current) => (current?.id === event.id ? null : current));
    } else if (event.type === "inventory_result") {
      writingRef.current = false;
      setWriting(false);
      if (event.changed) {
        setNotice("Inventory updated by Jarvis.");
        callbackRef.current?.();
      } else {
        setError(
          event.status === "unknown_outcome"
            ? "The save result is unknown. Check Inventory before repeating this change."
            : "The change was not saved. Check the inventory API and try a new request.",
        );
      }
    } else if (event.type === "interrupted" || event.type === "turn_complete") {
      transcriptIds.current = {};
      if (!audioRef.current?.sources.size) {
        setStatus(audioRef.current?.muted ? "idle" : "listening");
      }
    } else if (event.type === "notice") {
      setNotice(event.text);
    }
  }

  function connect() {
    if (audioRef.current && !audioRef.current.closed) return;
    setError("");
    setNotice("Allow microphone access to start the call.");
    setMessages([]);
    setApproval(null);
    setMuted(false);
    setWriting(false);
    writingRef.current = false;
    transcriptIds.current = {};
    setConnection("connecting");
    setStatus("thinking");
    const audio = new GeminiLiveAudio({
      onEvent: handleEvent,
      onPlayback: (playing) => {
        if (mountedRef.current)
          setStatus(
            playing
              ? "speaking"
              : audio.ready && !audio.muted
                ? "listening"
                : "idle",
          );
      },
      onError: (text) => {
        if (mountedRef.current) setError(text);
      },
      onClose: (text) => {
        if (!mountedRef.current) return;
        setConnection("idle");
        setStatus("idle");
        setApproval(null);
        setWriting(false);
        setNotice(
          writingRef.current
            ? "A submitted change may still finish. Inspect Inventory before repeating it."
            : text,
        );
        writingRef.current = false;
      },
    });
    audioRef.current = audio;
    void audio.start(language);
  }

  function toggleMute() {
    const next = !muted;
    audioRef.current?.setMuted(next);
    setMuted(next);
    if (!audioRef.current?.sources.size) setStatus(next ? "idle" : "listening");
  }

  function approve(approved) {
    if (!approval || approval.sent) return;
    if (
      audioRef.current?.send({ type: "approval", id: approval.id, approved })
    ) {
      setApproval({ ...approval, sent: true });
    }
  }

  function sendText(event) {
    event.preventDefault();
    const text = input.trim();
    if (
      text &&
      audioRef.current?.ready &&
      audioRef.current.send({ type: "text", text })
    ) {
      transcriptIds.current = {};
      setInput("");
      setStatus("thinking");
    }
  }

  const button =
    "rounded-lg border border-cyan-800 px-3 py-2 text-sm text-cyan-100 enabled:hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-40";
  const controls = (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${id}-language`}>
          Speaking language
        </label>
        <select
          id={`${id}-language`}
          value={language}
          disabled={connection !== "idle"}
          onChange={(event) => setLanguage(event.target.value)}
          className="rounded-lg border border-cyan-900 bg-[#082332] px-3 py-2 text-sm text-white"
        >
          <option value="si">සිංහල</option>
          <option value="en">English</option>
        </select>
        {connection === "idle" ? (
          <button
            type="button"
            onClick={connect}
            className={`${button} bg-cyan-700`}
          >
            Start live voice
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              disabled={connection !== "connected"}
              aria-pressed={muted}
              className={button}
            >
              {muted ? "Unmute mic" : "Mute mic"}
            </button>
            <button
              type="button"
              onClick={() => audioRef.current?.stop()}
              className={button}
            >
              End call
            </button>
          </>
        )}
      </div>
      <p role="status" className="text-xs leading-5 text-slate-300">
        {connection === "connecting"
          ? "Connecting…"
          : writing
            ? "Saving inventory change…"
            : notice || "Start a call to speak with Jarvis."}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-950 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
    </div>
  );

  return (
    <div
      className={
        showHead ? "grid min-w-0 gap-4 min-[1101px]:grid-cols-2" : "min-w-0"
      }
    >
      {showHead && (
        <div className="min-w-0 overflow-hidden rounded-2xl border border-cyan-900/50">
          <JarvisControlPanel status={status} controls={controls} />
        </div>
      )}
      <section
        aria-label="Jarvis live conversation"
        className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-900/50 bg-[#051824] text-slate-100"
      >
        <header className="border-b border-cyan-900/50 px-4 py-3">
          <h2 className="font-semibold text-cyan-200">Jarvis · Live voice</h2>
          <p className="mt-1 text-xs text-slate-400">
            {connection === "connected"
              ? muted
                ? "Microphone muted"
                : "Microphone on"
              : "Gemini Live"}{" "}
            · {status}
          </p>
        </header>
        {!showHead && controls}
        <div
          ref={logRef}
          role="log"
          aria-label="Live transcripts"
          className="max-h-[360px] min-h-[180px] flex-1 space-y-3 overflow-y-auto p-4 [overflow-wrap:anywhere]"
        >
          {!messages.length && (
            <p className="text-sm leading-6 text-slate-400">
              Start a call and ask about your inventory. Each new call starts a
              new conversation.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[95%] rounded-xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-cyan-950" : "mr-auto bg-slate-800"}`}
            >
              <p className="mb-1 text-xs text-cyan-300">
                {message.role === "user" ? "You" : "Jarvis"}
              </p>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          ))}
        </div>
        {approval && (
          <div
            role="region"
            aria-label="Review inventory change"
            className="m-3 rounded-xl border border-amber-700 bg-amber-950/30 p-3"
          >
            <p className="font-semibold text-amber-200">
              Review: {approval.operation.replaceAll("_", " ")}
            </p>
            <dl className="my-3 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(approval.fields).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-slate-400">
                    {fields[key] || key}
                  </dt>
                  <dd className="break-words">{String(value ?? "—")}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={approval.sent}
                onClick={() => approve(true)}
                className={`${button} bg-cyan-800`}
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={approval.sent}
                onClick={() => approve(false)}
                className={button}
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Check the product, SKU and values. This request expires after 90
              seconds.
            </p>
          </div>
        )}
        <form
          onSubmit={sendText}
          className="flex gap-2 border-t border-cyan-900/50 p-3"
        >
          <label htmlFor={`${id}-text`} className="sr-only">
            Message Jarvis
          </label>
          <input
            id={`${id}-text`}
            value={input}
            maxLength={2000}
            onChange={(event) => setInput(event.target.value)}
            disabled={
              connection !== "connected" || Boolean(approval) || writing
            }
            placeholder="Speak or type during the call…"
            className="min-w-0 flex-1 rounded-lg border border-cyan-900 bg-[#082332] px-3 py-2 text-sm text-white disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              connection !== "connected" ||
              !input.trim() ||
              Boolean(approval) ||
              writing
            }
            className={button}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

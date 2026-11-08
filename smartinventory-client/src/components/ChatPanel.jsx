import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import ReplyAudio from "./ReplyAudio.jsx";
import { enableVoiceSound } from "../lib/voiceAudio.js";

export default function ChatPanel({
  voiceRef,
  input,
  onInputChange,
  voiceActive = false,
  onStatusChange,
  onInventoryChanged,
}) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastReply, setLastReply] = useState(null);
  const [speechPhase, setSpeechPhase] = useState("idle");

  const [sessionId, setSessionId] = useState(
    () => crypto.randomUUID()
  );

  const requestRef = useRef(null);
  const bottomRef = useRef(null);

  const speechBusy =
    speechPhase === "loading" ||
    speechPhase === "speaking";

  const locked = busy || voiceActive || speechBusy;

  useImperativeHandle(voiceRef, () => ({
    sendVoice(text) {
      return sendMessage(text, true);
    },
  }));

  useEffect(() => {
    const status =
      busy || speechPhase === "loading"
        ? "thinking"
        : speechPhase === "speaking"
          ? "speaking"
          : "idle";

    onStatusChange?.(status);
  }, [busy, speechPhase, onStatusChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [messages, busy]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    void enableVoiceSound().catch(() => {});
    void sendMessage(input);
  }

  async function sendMessage(value, fromVoice = false) {
    const question = value.trim();

    if (
      !question ||
      requestRef.current ||
      busy ||
      speechBusy ||
      (!fromVoice && voiceActive)
    ) {
      return;
    }

    if (question.length > 2000) {
      setError(
        "ප්‍රශ්නය අක්ෂර 2000කට වඩා කෙටි කරන්න."
      );
      return;
    }

    const controller = new AbortController();
    const requestId = crypto.randomUUID();

    requestRef.current = controller;

    setBusy(true);
    setError("");
    setLastReply(null);
    setSpeechPhase("idle");
    onInputChange("");

    setMessages((previous) => [
      ...previous,
      {
        id: requestId,
        role: "user",
        content: question,
        failed: false,
      },
    ]);

    try {
      const response = await fetch("/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: sessionId,
          request_id: requestId,
          message: question,
        }),
      });

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `Jarvis API error: HTTP ${response.status}`
        );
      }

      if (
        typeof data?.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error(
          "Jarvisගෙන් වලංගු පිළිතුරක් ලැබුණේ නැහැ."
        );
      }

      if (controller.signal.aborted) return;

      setMessages((previous) => [
        ...previous,
        {
          id: `${requestId}-reply`,
          role: "assistant",
          content: data.reply,
        },
      ]);

      setLastReply({
        id: requestId,
        text: data.reply,
      });

      if (data.inventory_changed) {
        onInventoryChanged?.();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Jarvisගේ පිළිතුර ලබාගන්න බැරි වුණා."
        );

        setMessages((previous) =>
          previous.map((message) =>
            message.id === requestId
              ? { ...message, failed: true }
              : message
          )
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }

      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  function clearChat() {
    if (requestRef.current || locked) return;

    setMessages([]);
    setLastReply(null);
    setSpeechPhase("idle");
    onInputChange("");
    setError("");
    setSessionId(crypto.randomUUID());
  }

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section
      aria-labelledby="chat-heading"
      className="jarvis-panel flex min-w-0 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-cyan-900/40 px-5 py-4">
        <div>
          <h2
            id="chat-heading"
            className="text-base font-semibold"
          >
            Chat with Jarvis
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            සිංහල · Inventory assistant
          </p>
        </div>

        <button
          type="button"
          onClick={clearChat}
          disabled={locked || messages.length === 0}
          className="text-xs text-cyan-300 disabled:opacity-40"
        >
          Clear chat
        </button>
      </div>

      <div
        role="log"
        aria-label="Conversation with Jarvis"
        aria-live="polite"
        className="h-[420px] space-y-5 overflow-y-auto p-5 sm:h-[520px]"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-700 text-2xl text-cyan-300">
              J
            </div>

            <h3 className="mt-4 font-semibold">
              Ask Jarvis
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Speak ඔබලා ඔබේ ප්‍රශ්නය කියන්න.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <div className="max-w-[90%]">
              <p className="mb-1 text-xs text-slate-400">
                {message.role === "user"
                  ? "You"
                  : "Jarvis"}
              </p>

              <p
                className={`whitespace-pre-wrap break-words rounded-2xl border px-4 py-3 text-sm leading-7 ${
                  message.role === "user"
                    ? "border-cyan-800 bg-cyan-950/70"
                    : "border-slate-700 bg-slate-900"
                }`}
              >
                {message.content}
              </p>

              {message.failed && (
                <p className="mt-2 text-xs text-red-300">
                  Reply not received.
                </p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <p
            role="status"
            className="animate-pulse text-sm text-cyan-300 motion-reduce:animate-none"
          >
            Jarvis is thinking…
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {lastReply && (
        <ReplyAudio
          key={lastReply.id}
          text={lastReply.text}
          disabled={busy || voiceActive}
          onPhaseChange={setSpeechPhase}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-cyan-900/40 p-4"
      >
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-950/50 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <label
          htmlFor="jarvis-question"
          className="mb-2 block text-sm text-slate-300"
        >
          Your question
        </label>

        <textarea
          id="jarvis-question"
          value={input}
          onChange={(event) =>
            onInputChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
          rows={3}
          maxLength={2000}
          required
          disabled={locked}
          placeholder="අවශ්‍ය නම් මෙහි type කරන්න…"
          className="w-full resize-y rounded-xl border border-cyan-900/60 bg-[#041624] px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60"
        />

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={locked || !input.trim()}
            className="rounded-lg bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
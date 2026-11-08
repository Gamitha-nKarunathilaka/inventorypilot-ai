import { useRef, useState } from "react";
import ChatPanel from "./ChatPanel.jsx";
import VoiceControls from "./VoiceControls.jsx";
import JarvisHead from "./JarvisHead.jsx";
import StockDocumentImport from "./StockDocumentImport.jsx";
import GeminiLivePanel from "./GeminiLivePanel.jsx";

export default function InventoryAssistant({
  onInventoryChanged,
  isCreatePage = false,
  showHead = false,
}) {
  const [voiceMode, setVoiceMode] = useState("normal");
  const chatRef = useRef(null);
  const [jarvisStatus, setJarvisStatus] = useState("idle");
  const [draft, setDraft] = useState("");
  const [voicePhase, setVoicePhase] = useState("idle");

  const status = voicePhase === "idle" ? jarvisStatus : voicePhase;
  const statusText =
    {
      idle: "Ready",
      starting: "Starting microphone…",
      listening: "Listening…",
      processing: "Processing voice…",
      thinking: "Thinking…",
      speaking: "Speaking…",
      error: "Please try again",
    }[status] || "Working…";

  const headStatus =
    voicePhase === "listening"
      ? "listening"
      : voicePhase !== "idle"
        ? "thinking"
        : jarvisStatus === "thinking" || jarvisStatus === "speaking"
          ? jarvisStatus
          : "idle";

  function handleTranscript(text) {
    const question = typeof text === "string" ? text.trim() : "";
    if (!question) return;

    if (
      jarvisStatus !== "idle" ||
      typeof chatRef.current?.sendVoice !== "function"
    ) {
      // Keep the transcript available if chat cannot accept it yet.
      setDraft((previous) =>
        [previous.trim(), question].filter(Boolean).join(" "),
      );
      return;
    }

    chatRef.current.sendVoice(question);
  }

  return (
    <>
      <div aria-label="Voice mode" className="mb-3 flex gap-2">
        {[
          ["normal", "Normal"],
          ["live", "Live voice"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={voiceMode === value}
            disabled={
              voiceMode === "normal" &&
              (jarvisStatus !== "idle" || voicePhase !== "idle")
            }
            onClick={() => setVoiceMode(value)}
            className={`rounded-lg border px-4 py-2 text-sm disabled:opacity-40 ${voiceMode === value ? "border-cyan-400 bg-cyan-900 text-white" : "border-slate-700 text-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {voiceMode === "live" ? (
        <GeminiLivePanel
          showHead={showHead}
          onInventoryChanged={onInventoryChanged}
        />
      ) : (
        <section
          className={`inventory-assistant jcp ${
            showHead ? "inventory-assistant--with-head" : ""
          }`}
          aria-labelledby="inventory-jarvis-heading"
          data-status={status}
        >
          <header className="inventory-assistant__header">
            <span className="inventory-assistant__mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>

            <div>
              <h2 id="inventory-jarvis-heading">Jarvis</h2>
              <p className="inventory-assistant__status" role="status">
                <span aria-hidden="true" />
                {statusText}
              </p>
            </div>

            <span className="inventory-assistant__label">INVENTORY AI</span>
          </header>

          <p className="inventory-assistant__intro">
            {isCreatePage
              ? "Ask me about categories, stock or product details while you fill in the form."
              : "I can help you check or update inventory. Refer to a product by name or SKU."}
          </p>

          {showHead && (
            <div className="inventory-assistant__head">
              <JarvisHead status={headStatus} />
            </div>
          )}

          <div className="inventory-assistant__voice">
            <VoiceControls
              phase={voicePhase}
              onPhaseChange={setVoicePhase}
              onTranscript={handleTranscript}
              disabled={jarvisStatus !== "idle"}
            />
          </div>

          <div className="inventory-assistant__chat">
            <ChatPanel
              voiceRef={chatRef}
              input={draft}
              onInputChange={setDraft}
              voiceActive={voicePhase !== "idle"}
              onStatusChange={setJarvisStatus}
              onInventoryChanged={onInventoryChanged}
            />
          </div>
          <div className="shrink-0 border-t border-slate-700 p-3">
            <StockDocumentImport
              onInventoryChanged={onInventoryChanged}
              disabled={jarvisStatus !== "idle" || voicePhase !== "idle"}
            />
          </div>
        </section>
      )}
    </>
  );
}

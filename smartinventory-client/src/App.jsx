import { useRef, useState } from "react";

import Sidebar, { Icon } from "./components/Sidebar.jsx";
import ProductsSection from "./components/ProductsSection.jsx";
import AddProductForm from "./components/AddProductForm.jsx";
import InventoryAssistant from "./components/InventoryAssistant.jsx";
import InventoryOverview from "./components/InventoryOverview.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import JarvisControlPanel from "./components/JarvisControlPanel.jsx";
import StockDocumentImport from "./components/StockDocumentImport.jsx";
import GeminiLivePanel from "./components/GeminiLivePanel.jsx";

import "./styles/jarvis.css";
import "./styles/jarvis-control-panel.css";
import "./styles/inventory-assistant.css";
import "./styles/overview-dashboard.css";

function Overview({ refreshKey, onOpenInventory, onInventoryChanged }) {
  const [voiceMode, setVoiceMode] = useState("normal");
  const chatRef = useRef(null);
  const chatAreaRef = useRef(null);

  const [jarvisStatus, setJarvisStatus] = useState("idle");
  const [draft, setDraft] = useState("");
  const [voicePhase, setVoicePhase] = useState("idle");

  function handleTranscript(text) {
    const question = typeof text === "string" ? text.trim() : "";

    if (!question) {
      return;
    }

    if (
      jarvisStatus !== "idle" ||
      typeof chatRef.current?.sendVoice !== "function"
    ) {
      setDraft((previous) =>
        [previous.trim(), question].filter(Boolean).join(" "),
      );
      return;
    }

    chatRef.current.sendVoice(question);
  }

  function chooseQuestion(question) {
    setDraft(question);

    chatAreaRef.current
      ?.querySelector("textarea, input[type='text'], input:not([type])")
      ?.focus();
  }

  const suggestions = [
    ["Check stock", "මගේ inventory එකේ තොග තත්ත්වය පෙන්වන්න."],
    ["Find a product", "භාණ්ඩයක් සොයා ගැනීමට උදව් කරන්න."],
    ["Low-stock items", "තොග අඩු භාණ්ඩ මොනවාද?"],
  ];

  return (
    <InventoryOverview
      refreshKey={refreshKey}
      onOpenInventory={onOpenInventory}
    >
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
        <GeminiLivePanel showHead onInventoryChanged={onInventoryChanged} />
      ) : (
        <div
          className="
          grid min-w-0 grid-cols-1 items-stretch gap-4
          min-[1101px]:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]
        "
        >
          <div
            className="
            flex min-w-0 flex-col self-start overflow-hidden
            rounded-2xl border border-[#1b394a] bg-[#051824]
            [&>.jcp]:m-0! [&>.jcp]:w-full
            [&>.jcp]:rounded-none! [&>.jcp]:border-0!
            [&>.jcp]:shadow-none!
          "
          >
            <JarvisControlPanel
              status={jarvisStatus}
              voicePhase={voicePhase}
              onVoicePhaseChange={setVoicePhase}
              onTranscript={handleTranscript}
            />
            <div
              aria-label="Suggested questions"
              className="
              flex shrink-0 flex-wrap items-center justify-center gap-1.5
              border-t border-[#143341] p-2.5
            "
            >
              {suggestions.map(([label, question]) => (
                <button
                  key={label}
                  type="button"
                  disabled={jarvisStatus !== "idle" || voicePhase !== "idle"}
                  onClick={() => chooseQuestion(question)}
                  className="
                  rounded-lg border border-[#2c5266] bg-[#082332]
                  px-2.5 py-1.5 text-xs leading-6 text-cyan-100
                  enabled:hover:border-cyan-400 enabled:hover:bg-[#10384a]
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-cyan-300
                  disabled:cursor-not-allowed disabled:opacity-50
                "
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={chatAreaRef}
            className="
            flex h-[420px] min-h-0 min-w-0 flex-col overflow-hidden
            rounded-2xl border border-[#1b394a] bg-[#051824]
            max-[600px]:h-[400px]
            min-[1101px]:h-auto min-[1101px]:self-stretch
            min-[1101px]:[contain:size]
            [&>:first-child]:m-0! [&>:first-child]:flex
            [&>:first-child]:h-auto! [&>:first-child]:max-h-none!
            [&>:first-child]:min-h-0! [&>:first-child]:min-w-0
            [&>:first-child]:w-full [&>:first-child]:flex-1
            [&>:first-child]:flex-col [&>:first-child]:overflow-hidden!
            [&>:first-child]:rounded-none! [&>:first-child]:border-0!
            [&>:first-child]:bg-transparent! [&>:first-child]:shadow-none!
            [&>:first-child>*]:shrink-0
            [&_[class*='overflow-y-auto']]:flex-[1_1_0%]!
            [&_[class*='overflow-y-auto']]:min-h-0!
            [&_[class*='overflow-y-auto']]:max-h-none!
            [&_[class*='overflow-y-auto']]:overflow-y-auto
            [&_[class*='overflow-y-auto']]:overscroll-contain
            [&_[class*='overflow-y-auto']]:[overflow-wrap:anywhere]
            [&_[class*='overflow-y-auto']]:[scrollbar-width:thin]
            [&_[class*='overflow-y-auto']]:[scrollbar-color:#2b5065_transparent]
            [&_textarea]:h-16 [&_textarea]:min-h-14
            [&_textarea]:max-h-[100px] [&_textarea]:resize-y
            [&_textarea]:text-sm [&_textarea]:leading-relaxed
            [&_input:not([type='range']):not([type='checkbox'])]:text-sm
            [&_input:not([type='range']):not([type='checkbox'])]:leading-relaxed
            [&_audio]:w-full [&_audio]:max-w-[360px]
          "
          >
            <ChatPanel
              voiceRef={chatRef}
              input={draft}
              onInputChange={setDraft}
              voiceActive={voicePhase !== "idle"}
              onStatusChange={setJarvisStatus}
              onInventoryChanged={onInventoryChanged}
            />

            <div className="shrink-0 border-t border-slate-700 p-3">
              <StockDocumentImport
                onInventoryChanged={onInventoryChanged}
                disabled={jarvisStatus !== "idle" || voicePhase !== "idle"}
              />
            </div>
          </div>
        </div>
      )}
    </InventoryOverview>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const [inventoryView, setInventoryView] = useState("list");
  const [refreshKey, setRefreshKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");

  const isCreatePage = activePage === "inventory" && inventoryView === "create";

  function handlePageChange(page) {
    setSuccessMessage("");
    setInventoryView("list");
    setActivePage(page);
  }

  function openInventory() {
    handlePageChange("inventory");
  }

  function openOverview() {
    handlePageChange("overview");
  }

  function openCreateProduct() {
    setSuccessMessage("");
    setInventoryView("create");
    setActivePage("inventory");
  }

  function handleInventoryChanged() {
    setSuccessMessage("");
    setRefreshKey((previous) => previous + 1);
  }

  function handleJarvisInventoryChanged() {
    setSuccessMessage("Inventory updated by Jarvis.");
    setRefreshKey((previous) => previous + 1);
  }

  function handleProductCreated() {
    setRefreshKey((previous) => previous + 1);
    setSuccessMessage("Product added successfully.");
    setInventoryView("list");
    setActivePage("inventory");
  }

  return (
    <div
      className={`jarvis-app min-h-screen bg-[#020b13] text-slate-100 lg:flex ${
        activePage === "overview" ? "jov-overview-page" : ""
      }`}
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-cyan-200 p-3 text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <Sidebar activePage={activePage} onPageChange={handlePageChange} />

      <div className="min-w-0 flex-1">
        <header className="jov-page-header flex min-h-[76px] items-center justify-between gap-4 border-b border-cyan-900/50 bg-[#04121e] px-5 py-4 lg:px-6">
          <div>
            <p className="text-[10px] tracking-[0.18em] text-slate-500">
              SMART INVENTORY
            </p>

            <h1 className="mt-1 text-lg font-semibold">
              {activePage === "overview"
                ? "Overview"
                : isCreatePage
                  ? "Add product"
                  : "Inventory"}
            </h1>
            {activePage === "overview" && (
              <p className="jov-page-subtitle">
                Inventory insights and your AI assistant, together.
              </p>
            )}
          </div>

          <div className="jov-header-actions">
            <button
              type="button"
              onClick={
                activePage === "overview" || isCreatePage
                  ? openInventory
                  : openOverview
              }
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-900/70 px-3 py-2 text-xs text-cyan-200 hover:border-cyan-500/60 hover:bg-cyan-500/5"
            >
              {activePage === "overview"
                ? "Open inventory"
                : isCreatePage
                  ? "Back to products"
                  : "Back to overview"}

              <Icon name="arrow" className="h-4 w-4" />
            </button>

            {activePage === "overview" && (
              <button
                type="button"
                onClick={openCreateProduct}
                className="jov-add-button"
              >
                <span aria-hidden="true">+</span>
                Add product
              </button>
            )}
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 p-4 outline-none lg:p-6"
        >
          {activePage === "overview" ? (
            <Overview
              refreshKey={refreshKey}
              onOpenInventory={openInventory}
              onInventoryChanged={handleInventoryChanged}
            />
          ) : (
            <div className="inventory-with-assistant">
              <div className="min-w-0">
                {isCreatePage ? (
                  <section
                    aria-labelledby="add-product-heading"
                    className="mx-auto max-w-4xl rounded-2xl bg-slate-100 p-4 text-slate-900 sm:p-6"
                  >
                    <div className="mb-6">
                      <p className="text-xs font-medium text-slate-500">
                        Inventory / Add product
                      </p>

                      <h2
                        id="add-product-heading"
                        className="mt-2 text-2xl font-bold"
                      >
                        Add new product
                      </h2>

                      <p className="mt-2 text-sm text-slate-600">
                        Enter the product details and save to return to the
                        product list.
                      </p>
                    </div>

                    <AddProductForm onCreated={handleProductCreated} />

                    <button
                      type="button"
                      onClick={openInventory}
                      className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Back to products
                    </button>
                  </section>
                ) : (
                  <section
                    aria-labelledby="products-heading"
                    className="rounded-2xl bg-slate-100 p-4 text-slate-900 sm:p-6"
                  >
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2
                          id="products-heading"
                          className="text-2xl font-bold"
                        >
                          Products
                        </h2>

                        <p className="mt-2 text-sm text-slate-600">
                          Manage your products and monitor stock levels.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={openCreateProduct}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <span
                          aria-hidden="true"
                          className="text-lg leading-none"
                        >
                          +
                        </span>
                        Add new product
                      </button>
                    </div>

                    {successMessage && (
                      <div
                        role="status"
                        className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                      >
                        <p>{successMessage}</p>

                        <button
                          type="button"
                          onClick={() => setSuccessMessage("")}
                          aria-label="Dismiss success message"
                          className="rounded px-2 py-1 font-semibold hover:bg-emerald-100"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>
                    )}

                    <ProductsSection
                      key={refreshKey}
                      refreshKey={refreshKey}
                      onChanged={handleInventoryChanged}
                    />
                  </section>
                )}
              </div>

              <aside
                aria-label="Jarvis inventory assistant"
                className="inventory-assistant-column"
              >
                <InventoryAssistant
                  showHead={false}
                  isCreatePage={isCreatePage}
                  onInventoryChanged={handleJarvisInventoryChanged}
                />
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

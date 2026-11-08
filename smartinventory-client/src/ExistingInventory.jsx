import { useState } from "react";
import Sidebar, { Icon } from "./components/Sidebar.jsx";
import ExistingInventory from "./ExistingInventory.jsx";
import "./styles/jarvis.css";

function Overview({ onOpenInventory }) {
  const statistics = [
    { label: "Total products", icon: "box", color: "text-cyan-300" },
    { label: "Low-stock items", icon: "warning", color: "text-amber-300" },
    { label: "Today's sales", icon: "chart", color: "text-emerald-300" },
    { label: "Pending orders", icon: "file", color: "text-violet-300" },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="assistant-heading" className="jarvis-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-cyan-900/40 px-5 py-4">
            <div>
              <h2 id="assistant-heading" className="text-lg font-semibold text-cyan-300">JARVIS</h2>
              <p className="mt-1 text-xs text-slate-400">Your inventory AI assistant</p>
            </div>
            <span className="rounded-full border border-cyan-900/70 px-3 py-1 text-[10px] tracking-widest text-slate-400">IDLE</span>
          </div>

          <div className="jarvis-grid flex min-h-[330px] flex-col items-center justify-center px-5 py-8 text-center">
            <div className="flex h-44 w-44 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/5 shadow-[0_0_65px_rgba(6,182,212,0.08)]">
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-dashed border-cyan-400/35">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-500/10 text-cyan-300">
                  <Icon name="mic" className="h-9 w-9" />
                </div>
              </div>
            </div>
            <h3 className="mt-6 text-lg font-medium text-slate-100">Your inventory, in conversation.</h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">Ask about products, check stock, and manage your inventory.</p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-cyan-900/40 px-5 py-4">
            <p className="text-xs text-slate-400">Assistant not connected</p>
            <button type="button" disabled className="flex items-center gap-2 rounded-lg border border-cyan-700/50 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="mic" className="h-4 w-4" /> Speak
            </button>
          </div>
        </section>

        <section aria-labelledby="inventory-heading" className="jarvis-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="inventory-heading" className="text-sm font-semibold">Inventory overview</h2>
            <button type="button" onClick={onOpenInventory} className="rounded text-xs font-medium text-cyan-300 hover:text-cyan-100">View inventory</button>
          </div>
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            {statistics.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-700/60 bg-[#03111d] p-3">
                <Icon name={item.icon} className={`h-5 w-5 ${item.color}`} />
                <p className="mt-3 text-[11px] text-slate-400">{item.label}</p>
                <p aria-label="Data not loaded" className="mt-1 text-xl font-semibold text-slate-300">—</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="stock-heading" className="jarvis-panel p-4">
          <h2 id="stock-heading" className="text-sm font-semibold">Low-stock products</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Open Inventory to view your current products and stock levels.</p>
          <button type="button" onClick={onOpenInventory} className="mt-3 inline-flex items-center gap-2 rounded text-xs font-medium text-cyan-300 hover:text-cyan-100">
            Open inventory <Icon name="arrow" className="h-4 w-4" />
          </button>
        </section>
      </div>

      <section aria-labelledby="chat-heading" className="jarvis-panel flex min-h-[440px] min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-cyan-900/40 px-5 py-4">
          <h2 id="chat-heading" className="text-base font-semibold">Chat with Jarvis</h2>
          <span className="text-xs text-slate-500">0 messages</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-900/60 bg-cyan-500/5 text-cyan-500">
            <Icon name="chat" className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-base font-medium text-slate-200">Start a conversation</h3>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">Your questions and Jarvis's replies will appear here.</p>
        </div>
        <div className="border-t border-cyan-900/40 p-4">
          <label htmlFor="jarvis-message" className="sr-only">Message Jarvis</label>
          <div className="flex items-center gap-3 rounded-xl border border-cyan-900/60 bg-[#041624] p-3">
            <input id="jarvis-message" disabled placeholder="Ask Jarvis about your inventory..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-500 disabled:cursor-not-allowed" />
            <button type="button" disabled aria-label="Send message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="send" className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">Connect the assistant to send messages.</p>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const openInventory = () => setActivePage("inventory");

  return (
    <div className="jarvis-app min-h-screen bg-[#020b13] text-slate-100 lg:flex">
      <a href="#main-content" className="sr-only z-50 rounded bg-cyan-200 p-3 text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <Sidebar activePage={activePage} onPageChange={setActivePage} />

      <div className="min-w-0 flex-1">
        <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-cyan-900/50 bg-[#04121e] px-5 py-4 lg:px-6">
          <div>
            <p className="text-[10px] tracking-[0.18em] text-slate-500">SMART INVENTORY</p>
            <h1 className="mt-1 text-lg font-semibold">{activePage === "overview" ? "Overview" : "Inventory"}</h1>
          </div>
          <button type="button" onClick={activePage === "overview" ? openInventory : () => setActivePage("overview")} className="inline-flex items-center gap-2 rounded-lg border border-cyan-900/70 px-3 py-2 text-xs text-cyan-200 hover:border-cyan-500/60 hover:bg-cyan-500/5">
            {activePage === "overview" ? "Open inventory" : "Back to overview"}
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 p-4 outline-none lg:p-6">
          {activePage === "overview" ? (
            <Overview onOpenInventory={openInventory} />
          ) : (
            <ExistingInventory />
          )}
        </main>
      </div>
    </div>
  );
}

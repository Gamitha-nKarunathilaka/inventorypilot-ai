const navigation = [
  { id: "overview", label: "Overview", icon: "home", available: true },
  { id: "inventory", label: "Inventory", icon: "box", available: true },
  { id: "purchases", label: "Purchases", icon: "cart", available: false },
  { id: "sales", label: "Sales", icon: "chart", available: false },
  { id: "reports", label: "Reports", icon: "file", available: false },
  { id: "settings", label: "Settings", icon: "settings", available: false },
];

export function Icon({ name, className = "h-5 w-5" }) {
  const paths = {
    home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
    box: "m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v8M7.5 5.5l9 5",
    cart: "M2 3h3l3 13h11l3-9H6m3 13h.01M18 20h.01",
    chart: "M4 20h16M6 16v-5m6 5V4m6 12V8",
    file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8",
    settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
    mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8",
    chat: "M21 11a8 8 0 0 1-8 8H9l-6 3V11a9 9 0 0 1 18 0ZM7 10h10m-10 4h6",
    send: "m3 3 19 9-19 9 4-9-4-9Zm4 9h15",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
    stop: "M6 6h12v12H6z",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name] || paths.box} />
    </svg>
  );
}

export default function Sidebar({ activePage, onPageChange }) {
  return (
    <aside className="border-b border-cyan-900/60 bg-[#04121e] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-cyan-900/40 px-5 py-6">
        <svg className="h-12 w-12 shrink-0 text-cyan-400" viewBox="0 0 52 52" fill="none" aria-hidden="true">
          <circle cx="26" cy="26" r="23" stroke="currentColor" strokeWidth="2" strokeDasharray="40 7 14 7" />
          <circle cx="26" cy="26" r="17" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <circle cx="26" cy="26" r="11" stroke="currentColor" strokeWidth="2" />
          <path d="M26 3v6m0 34v6M3 26h6m34 0h6" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div>
          <p className="text-2xl font-semibold tracking-[0.18em] text-white">JARVIS</p>
          <p className="mt-1 text-[9px] tracking-[0.14em] text-sky-200">INVENTORY AI ASSISTANT</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex gap-2 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible lg:px-4 lg:py-6">
        {navigation.map((item) => {
          const active = activePage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              disabled={!item.available}
              aria-current={active ? "page" : undefined}
              title={item.available ? item.label : `${item.label} is not available yet`}
              onClick={() => onPageChange(item.id)}
              className={`flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors lg:w-full lg:py-4 ${
                active
                  ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[inset_3px_0_0_#22d3ee]"
                  : "border-transparent text-slate-300 enabled:hover:bg-cyan-950/50 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              }`}
            >
              <Icon name={item.icon} className={`h-5 w-5 shrink-0 ${active ? "text-cyan-300" : ""}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden p-4 lg:block">
        <div className="rounded-xl border border-cyan-900/60 bg-[#03101a] p-4">
          <p className="text-xs font-medium text-slate-300">Assistant status</p>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />
            Not connected
          </p>
          <div className="mt-4 flex h-4 items-center gap-1 text-cyan-700" aria-hidden="true">
            {[6, 11, 16, 8, 13, 5, 11, 16, 8, 12, 6, 9, 4, 6].map((height, index) => (
              <span key={index} className="w-0.5 rounded-full bg-current" style={{ height }} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

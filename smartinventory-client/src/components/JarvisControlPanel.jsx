import JarvisHead from "./JarvisHead.jsx";

import "../styles/jarvis-control-panel.css";

const states = ["idle", "listening", "thinking", "speaking"];

const labels = {
  idle: "Ready to help",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

const bars = [10, 18, 12, 26, 35, 22, 42, 30, 20, 28, 15, 9];

export default function JarvisControlPanel({
  status = "idle",
  controls,
}) {
  const mode = states.includes(status) ? status : "idle";

  return (
    <section
      className="jcp jcp--compact"
      data-mode={mode}
      aria-labelledby="assistant-heading"
    >
      <header className="jcp-header">
        <div className="jcp-brand">
          <span className="jcp-mark" aria-hidden="true" />

          <div>
            <h2 id="assistant-heading">JARVIS</h2>

            <p>Your inventory AI assistant</p>
          </div>
        </div>

        <span className="jcp-badge">
          <i aria-hidden="true" />
          {mode}
        </span>
      </header>

      <div className="jcp-scene">
        <div className="jcp-face">
          <JarvisHead status={mode} />
        </div>

        <ul className="jcp-states" aria-label="Assistant state">
          {states.map((state) => (
            <li key={state} aria-current={mode === state ? "true" : undefined}>
              <i aria-hidden="true" />
              {state}
            </li>
          ))}
        </ul>

        <div className="jcp-signal" aria-hidden="true">
          <span>{labels[mode]}</span>

          <div className="jcp-wave">
            {bars.map((height, index) => (
              <i
                key={index}
                style={{
                  height,
                  animationDelay: `${index * -0.09}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="jcp-platform" aria-hidden="true" />
      </div>

      <p className="jcp-caption">{labels[mode]}</p>

      <div className="jcp-control-area">{controls}</div>
    </section>
  );
}

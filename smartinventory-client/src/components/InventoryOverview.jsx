import { useEffect, useState } from "react";

const numberFormat = new Intl.NumberFormat("en-US");
const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency", currency: "LKR", currencyDisplay: "code",
  maximumFractionDigits: 2,
});
const compactMoneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency", currency: "LKR", currencyDisplay: "code",
  notation: "compact", maximumFractionDigits: 2,
});

function validProduct(product) {
  return product !== null && typeof product === "object" &&
    Number.isSafeInteger(product.id) &&
    typeof product.name === "string" && typeof product.sku === "string" &&
    Number.isSafeInteger(product.quantity) && product.quantity >= 0 &&
    Number.isSafeInteger(product.reorderLevel) && product.reorderLevel >= 0;
}

function DashboardIcon({ name }) {
  const paths = {
    box: "M12 3 3 8l9 5 9-5-9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5",
    units: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
    value: "M3 3h8l10 10-8 8L3 11V3ZM7 7h.01",
    warning: "m12 3 10 18H2L12 3ZM12 9v5M12 18h.01",
    refresh: "M20 7v5h-5M4 17v-5h5M5.2 7a8 8 0 0 1 13.2-2L20 7M4 17l1.6 2A8 8 0 0 0 18.8 17",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export default function InventoryOverview({
  refreshKey = 0,
  onOpenInventory,
  children,
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);

    async function loadInventory() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/products", {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Could not load inventory. HTTP ${response.status}.`);
        }
        const data = await response.json();
        if (!Array.isArray(data) || !data.every(validProduct) ||
          new Set(data.map((product) => product.id)).size !== data.length) {
          throw new Error("The products API returned unexpected data.");
        }
        if (active) {
          setProducts(data);
          setUpdatedAt(new Date());
        }
      } catch (err) {
        if (active) {
          setError(controller.signal.aborted
            ? "Inventory took too long to respond. Please retry."
            : err instanceof Error ? err.message : "Could not load inventory.");
        }
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    loadInventory();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey, reloadKey]);

  const ready = !loading && !error;
  const total = products.length;
  const out = products.filter((p) => p.quantity === 0).length;
  const low = products.filter((p) => p.quantity > 0 && p.quantity <= p.reorderLevel).length;
  const healthy = total - low - out;
  const attention = low + out;
  const units = products.reduce((sum, p) => sum + p.quantity, 0);
  const pricesAvailable = products.every((p) =>
    typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0);
  const value = pricesAvailable
    ? products.reduce((sum, p) => sum + p.price * p.quantity, 0)
    : null;
  const valueAvailable = value !== null && Number.isFinite(value);
  const categoriesAvailable = products.every((p) =>
    typeof p.category === "string" && p.category.trim());
  const categoryCount = new Set(products.map((p) =>
    typeof p.category === "string" ? p.category.trim().toLowerCase() : ""
  )).size;
  const priority = products.filter((p) => p.quantity <= p.reorderLevel)
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  const visiblePriority = showAll ? priority : priority.slice(0, 5);
  const healthyPercent = total ? Math.round(healthy / total * 100) : 0;
  const healthyEnd = total ? healthy / total * 100 : 0;
  const lowEnd = total ? (healthy + low) / total * 100 : 0;
  const ring = ready && total
    ? `conic-gradient(#22d3ee 0% ${healthyEnd}%, #fbbf24 ${healthyEnd}% ${lowEnd}%, #fb7185 ${lowEnd}% 100%)`
    : "#193544";

  const statistics = [
    { label: "Total products", value: numberFormat.format(total), icon: "box",
      detail: categoriesAvailable
        ? `Across ${categoryCount} ${categoryCount === 1 ? "category" : "categories"}`
        : "Products in your inventory" },
    { label: "Units in stock", value: Number.isSafeInteger(units) ? numberFormat.format(units) : "—",
      icon: "units", detail: "Available inventory" },
    { label: "Stock value", value: valueAvailable ? compactMoneyFormat.format(value) : "—",
      fullValue: valueAvailable ? moneyFormat.format(value) : undefined, icon: "value",
      detail: valueAvailable ? "At current product prices" : "Price data unavailable" },
    { label: "Needs attention", value: numberFormat.format(attention), icon: "warning", tone: "amber",
      detail: `${numberFormat.format(low)} low stock · ${numberFormat.format(out)} out of stock` },
  ];

  return (
    <div className="jov-dashboard">
      <div className="jov-data-status">
        <p role="status">
          <span className={`jov-status-dot ${error ? "is-error" : ""}`} aria-hidden="true" />
          {loading ? "Loading inventory…" : error ? "Inventory unavailable"
            : `Updated ${updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        </p>
        <button type="button" className="jov-link" disabled={loading}
          onClick={() => setReloadKey((previous) => previous + 1)}>
          <DashboardIcon name="refresh" />
          {loading ? "Refreshing…" : error ? "Retry" : "Refresh"}
        </button>
      </div>

      {error && <div className="jov-error" role="alert">{error}</div>}

      <dl className="jov-kpis" aria-label="Inventory summary" aria-busy={loading}>
        {statistics.map((item) => (
          <div key={item.label} className={`jov-kpi ${item.tone ? `jov-kpi--${item.tone}` : ""}`}>
            <span className="jov-kpi-icon"><DashboardIcon name={item.icon} /></span>
            <div>
              <dt>{item.label}</dt>
              <dd title={ready ? item.fullValue : undefined}>{ready ? item.value : "—"}</dd>
              <p>{ready ? item.detail : loading ? "Loading current data…" : "Data unavailable"}</p>
            </div>
          </div>
        ))}
      </dl>

      {children}

      <div className="jov-insights">
        <section className="jov-panel" aria-labelledby="stock-health-heading">
          <header className="jov-panel-header">
            <h2 id="stock-health-heading">Stock health</h2>
            <span>By product</span>
          </header>
          <div className="jov-health">
            <div className="jov-donut" style={{ background: ring }} role="img"
              aria-label={ready && total
                ? `${healthy} healthy, ${low} low stock, ${out} out of stock`
                : "Stock health unavailable"}>
              <div>
                <strong>{ready && total ? `${healthyPercent}%` : "—"}</strong>
                <span>{ready && total ? "Healthy" : ready ? "No products" : "Awaiting data"}</span>
              </div>
            </div>
            <dl className="jov-legend">
              {[
                { label: "Healthy", count: healthy, tone: "cyan" },
                { label: "Low stock", count: low, tone: "amber" },
                { label: "Out of stock", count: out, tone: "rose" },
              ].map((item) => (
                <div key={item.label}>
                  <dt><i className={`jov-dot--${item.tone}`} aria-hidden="true" />{item.label}</dt>
                  <dd>{ready ? numberFormat.format(item.count) : "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="jov-panel-note">Out-of-stock products are counted separately.</p>
        </section>

        <section className="jov-panel jov-priority" aria-labelledby="priority-stock-heading">
          <header className="jov-panel-header">
            <h2 id="priority-stock-heading">Priority stock
              {ready && attention > 0 && <span className="jov-count">{attention}</span>}
            </h2>
            <button type="button" className="jov-link" onClick={onOpenInventory}
              disabled={!onOpenInventory}>View inventory <span aria-hidden="true">↗</span></button>
          </header>
          {!ready ? (
            <p className="jov-empty">{loading ? "Loading stock levels…" : "Use Retry to load stock levels."}</p>
          ) : !total ? (
            <div className="jov-empty"><strong>Your inventory starts here.</strong>
              <p>Add your first product to see stock insights.</p></div>
          ) : !attention ? (
            <div className="jov-empty jov-empty--success"><span aria-hidden="true">✓</span>
              <strong>All stocked up.</strong><p>Every product is above its reorder level.</p></div>
          ) : (
            <>
              <div className="jov-table-scroll">
                <table className="jov-table">
                  <caption className="jov-sr-only">Products at or below their reorder level</caption>
                  <thead><tr>{["Product", "SKU", "Available", "Reorder level", "Status"].map((label) => (
                    <th key={label} scope="col">{label}</th>
                  ))}</tr></thead>
                  <tbody>{visiblePriority.map((product) => (
                    <tr key={product.id}>
                      <th scope="row">{product.name}</th>
                      <td>{product.sku}</td>
                      <td className={product.quantity === 0 ? "jov-text-rose" : "jov-text-amber"}>
                        {numberFormat.format(product.quantity)}
                      </td>
                      <td>{numberFormat.format(product.reorderLevel)}</td>
                      <td><span className={`jov-badge ${product.quantity === 0 ? "jov-badge--out" : "jov-badge--low"}`}>
                        {product.quantity === 0 ? "Out of stock" : "Low stock"}
                      </span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {priority.length > 5 && (
                <button type="button" className="jov-show-all" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Show fewer products" : `View all ${numberFormat.format(priority.length)} products`}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

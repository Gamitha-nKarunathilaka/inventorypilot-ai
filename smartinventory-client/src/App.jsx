import { useState } from "react";

import Sidebar, { Icon } from "./components/Sidebar.jsx";
import ProductsSection from "./components/ProductsSection.jsx";
import AddProductForm from "./components/AddProductForm.jsx";
import InventoryAssistant from "./components/InventoryAssistant.jsx";
import InventoryOverview from "./components/InventoryOverview.jsx";
import GeminiLivePanel from "./components/GeminiLivePanel.jsx";

import "./styles/jarvis.css";
import "./styles/jarvis-control-panel.css";
import "./styles/inventory-assistant.css";
import "./styles/overview-dashboard.css";

function Overview({ refreshKey, onOpenInventory, onInventoryChanged }) {
  return (
    <InventoryOverview
      refreshKey={refreshKey}
      onOpenInventory={onOpenInventory}
    >
      <GeminiLivePanel showHead onInventoryChanged={onInventoryChanged} />
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

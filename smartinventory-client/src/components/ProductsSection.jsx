import { useEffect, useRef, useState } from "react";

const MAX_INT = 2147483647;
const MAX_PRICE = 999999999.99;

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";

const buttonClass =
  "rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

const unknownResult =
  "The result could not be confirmed. Reload the current product data and check whether the change completed before trying again.";

function validProduct(product) {
  return (
    product &&
    Number.isInteger(product.id) &&
    product.id > 0 &&
    typeof product.name === "string" &&
    typeof product.sku === "string" &&
    Number.isFinite(product.price) &&
    product.price >= 0 &&
    Number.isInteger(product.quantity) &&
    product.quantity >= 0 &&
    Number.isInteger(product.reorderLevel) &&
    product.reorderLevel >= 0
  );
}

async function apiRequest(
  path,
  { method = "GET", body, signal } = {}
) {
  const writing = method !== "GET";
  const controller = writing ? new AbortController() : null;

  const timer = writing
    ? setTimeout(() => controller.abort(), 30000)
    : null;

  try {
    let response;

    try {
      response = await fetch(`/api${path}`, {
        method,
        signal: controller?.signal ?? signal,
        cache: "no-store",

        ...(body
          ? {
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }
          : {}),
      });
    } catch (cause) {
      if (!writing && signal?.aborted) {
        throw cause;
      }

      const error = new Error(
        writing
          ? unknownResult
          : "Could not connect to the inventory API."
      );

      error.uncertain = writing;
      throw error;
    }

    const accepted = writing ? [200, 204] : [200];

    if (!accepted.includes(response.status)) {
      let message =
        `Request failed. HTTP status: ${response.status}`;

      try {
        const data = await response.json();

        const validation =
          data?.errors && typeof data.errors === "object"
            ? Object.values(data.errors)
                .flat()
                .filter((value) => typeof value === "string")
                .join(" ")
            : "";

        const detail =
          validation || data?.detail || data?.title || data;

        if (typeof detail === "string" && detail.trim()) {
          message = detail.slice(0, 500);
        }
      } catch {
        // Use the HTTP status when no JSON error is available.
      }

      const uncertain =
        writing &&
        (
          response.status >= 500 ||
          response.status === 408 ||
          response.ok
        );

      const error = new Error(
        uncertain ? unknownResult : message
      );

      error.uncertain = uncertain;
      throw error;
    }

    // Successful PUT/DELETE requests may have no response body.
    if (writing) {
      return null;
    }

    try {
      return await response.json();
    } catch {
      throw new Error(
        "The inventory API returned invalid JSON."
      );
    }
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function EditProductForm({
  productId,
  onCancel,
  onSaved,
}) {
  const [form, setForm] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const savingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const controller = new AbortController();

    async function loadForm() {
      setLoading(true);
      setError("");
      setForm(null);

      try {
        const [product, items] = await Promise.all([
          apiRequest(`/products/${productId}`, {
            signal: controller.signal,
          }),
          apiRequest("/categories", {
            signal: controller.signal,
          }),
        ]);

        if (
          !validProduct(product) ||
          product.id !== productId ||
          !Number.isInteger(product.categoryId)
        ) {
          throw new Error(
            "Product details must include categoryId and the current product fields."
          );
        }

        if (
          !Array.isArray(items) ||
          !items.every(
            (item) =>
              item &&
              Number.isInteger(item.id) &&
              item.id > 0 &&
              typeof item.name === "string"
          )
        ) {
          throw new Error(
            "The categories API returned unexpected data."
          );
        }

        if (!controller.signal.aborted) {
          setCategories(items);

          setForm({
            name: product.name,
            sku: product.sku,
            categoryId: items.some(
              (item) => item.id === product.categoryId
            )
              ? String(product.categoryId)
              : "",
            price: String(product.price),
            quantity: String(product.quantity),
            reorderLevel: String(product.reorderLevel),
          });

          setNeedsReload(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err.message || "Could not load product details."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadForm();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [productId, reloadKey]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (savingRef.current || !form || needsReload) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      categoryId: Number(form.categoryId),
      price: Number(form.price),
      quantity: Number(form.quantity),
      reorderLevel: Number(form.reorderLevel),
    };

    if (
      !payload.name ||
      payload.name.length > 100 ||
      !payload.sku ||
      payload.sku.length > 50
    ) {
      setError(
        "Enter a name of up to 100 characters and a SKU of up to 50 characters."
      );
      return;
    }

    if (
      !categories.some(
        (item) => item.id === payload.categoryId
      )
    ) {
      setError("Choose a valid category.");
      return;
    }

    if (
      [form.price, form.quantity, form.reorderLevel].some(
        (value) => value.trim() === ""
      ) ||
      !Number.isFinite(payload.price) ||
      payload.price < 0 ||
      payload.price > MAX_PRICE ||
      [payload.quantity, payload.reorderLevel].some(
        (value) =>
          !Number.isInteger(value) ||
          value < 0 ||
          value > MAX_INT
      )
    ) {
      setError(
        "Enter a valid price and non-negative whole numbers for quantity and reorder level."
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");

    let saved = false;

    try {
      await apiRequest(`/products/${productId}`, {
        method: "PUT",
        body: payload,
      });

      saved = true;
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Could not save product.");
        setNeedsReload(Boolean(err.uncertain));
      }
    } finally {
      savingRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }

    if (saved) {
      onSaved();
    }
  }

  const fields = [
    {
      name: "name",
      label: "Product name",
      type: "text",
      maxLength: 100,
    },
    {
      name: "sku",
      label: "SKU",
      type: "text",
      maxLength: 50,
    },
    {
      name: "price",
      label: "Price (LKR)",
      type: "number",
      min: 0,
      max: MAX_PRICE,
      step: "any",
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      min: 0,
      max: MAX_INT,
      step: 1,
    },
    {
      name: "reorderLevel",
      label: "Reorder level",
      type: "number",
      min: 0,
      max: MAX_INT,
      step: 1,
    },
  ];

  return (
    <section
      aria-labelledby="edit-product-heading"
      className="rounded-2xl border border-blue-200 bg-white p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3
          id="edit-product-heading"
          className="text-lg font-semibold"
        >
          Edit product
        </h3>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`${buttonClass} bg-slate-100 text-slate-700`}
        >
          Cancel
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {(needsReload || (!loading && !form)) && (
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading || saving}
          className={`${buttonClass} mb-4 bg-blue-50 text-blue-700`}
        >
          Reload product
        </button>
      )}

      {loading ? (
        <p role="status" className="text-sm text-slate-500">
          Loading product details...
        </p>
      ) : (
        form && (
          <form onSubmit={handleSubmit}>
            <fieldset disabled={saving || needsReload}>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(
                  ({ name, label, ...inputProps }) => (
                    <label
                      key={name}
                      className="block text-sm font-medium text-slate-700"
                    >
                      {label}

                      <input
                        {...inputProps}
                        name={name}
                        required
                        autoFocus={name === "name"}
                        value={form[name]}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            [name]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  )
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Category

                  <select
                    name="categoryId"
                    required
                    value={form.categoryId}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        categoryId: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">
                      Choose a category
                    </option>

                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Quantity is the final stock total.
              </p>

              {categories.length === 0 && (
                <p className="mt-3 text-sm text-amber-700">
                  Add a category before saving this product.
                </p>
              )}

              <button
                type="submit"
                disabled={categories.length === 0}
                className={`${buttonClass} mt-5 bg-blue-600 text-white hover:bg-blue-700`}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </fieldset>
          </form>
        )
      )}
    </section>
  );
}

export default function ProductsSection({
  refreshKey = 0,
  onChanged,
}) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const deletingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setLoadError("");

      try {
        const data = await apiRequest("/products", {
          signal: controller.signal,
        });

        if (
          !Array.isArray(data) ||
          !data.every(validProduct)
        ) {
          throw new Error(
            "The products API returned unexpected data."
          );
        }

        if (!controller.signal.aborted) {
          setProducts(data);
          setNeedsRefresh(false);
          setActionError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(
            err.message || "Could not load products."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => controller.abort();
  }, [refreshKey, reloadKey]);

  function handleChanged(message) {
    if (mountedRef.current) {
      setEditingId(null);
      setNotice(message);
    }

    if (onChanged) {
      onChanged();
    } else if (mountedRef.current) {
      setReloadKey((key) => key + 1);
    }
  }

  async function handleDelete(product) {
    if (
      deletingRef.current ||
      editingId !== null ||
      needsRefresh
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${product.name}" (SKU: ${product.sku})?\nThis removes the product from inventory.`
    );

    if (!confirmed) {
      return;
    }

    deletingRef.current = true;
    setDeletingId(product.id);
    setActionError("");
    setNotice("");

    let deleted = false;

    try {
      await apiRequest(`/products/${product.id}`, {
        method: "DELETE",
      });

      deleted = true;
    } catch (err) {
      if (mountedRef.current) {
        setActionError(
          err.message || "Could not delete product."
        );
        setNeedsRefresh(Boolean(err.uncertain));
      }
    } finally {
      deletingRef.current = false;

      if (mountedRef.current) {
        setDeletingId(null);
      }
    }

    if (deleted) {
      handleChanged(`${product.name} was deleted.`);
    }
  }

  const query = search.trim().toLowerCase();

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.sku} ${
      typeof product.category === "string"
        ? product.category
        : ""
    }`
      .toLowerCase()
      .includes(query)
  );

  const actionsDisabled =
    deletingId !== null ||
    editingId !== null ||
    needsRefresh;

  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {editingId !== null && (
        <EditProductForm
          key={editingId}
          productId={editingId}
          onCancel={() => setEditingId(null)}
          onSaved={() =>
            handleChanged("Product updated successfully.")
          }
        />
      )}

      <section
        aria-label="Product list"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-5">
          <label className="block w-full text-sm font-medium text-slate-700 sm:max-w-md">
            Search products

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search by name, SKU, or category..."
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={() =>
              setReloadKey((key) => key + 1)
            }
            disabled={
              loading ||
              deletingId !== null ||
              editingId !== null
            }
            className={`${buttonClass} bg-slate-100 text-slate-700`}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p
            role="status"
            className="p-6 text-slate-500"
          >
            Loading products...
          </p>
        ) : loadError ? (
          <p role="alert" className="p-6 text-red-700">
            {loadError} Use Refresh to try again.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {[
                      "Product",
                      "SKU",
                      "Category",
                      "Price (LKR)",
                      "Quantity",
                      "Reorder level",
                      "Status",
                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="whitespace-nowrap px-4 py-4 font-semibold"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-slate-50"
                    >
                      <th
                        scope="row"
                        className="px-4 py-4 font-medium"
                      >
                        {product.name}
                      </th>

                      <td className="px-4 py-4 text-slate-500">
                        {product.sku}
                      </td>

                      <td className="px-4 py-4">
                        {typeof product.category === "string"
                          ? product.category
                          : "—"}
                      </td>

                      <td className="px-4 py-4 tabular-nums">
                        {product.price.toFixed(2)}
                      </td>

                      <td className="px-4 py-4 tabular-nums">
                        {product.quantity}
                      </td>

                      <td className="px-4 py-4 tabular-nums">
                        {product.reorderLevel}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                            product.quantity === 0
                              ? "bg-rose-100 text-rose-800"
                              : product.quantity <=
                                  product.reorderLevel
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {product.quantity === 0
                            ? "Out of stock"
                            : product.quantity <=
                                product.reorderLevel
                              ? "Low stock"
                              : "In stock"}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actionsDisabled}
                            onClick={() => {
                              setNotice("");
                              setActionError("");
                              setEditingId(product.id);
                            }}
                            aria-label={`Edit ${product.name} (${product.sku})`}
                            className={`${buttonClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={actionsDisabled}
                            onClick={() =>
                              handleDelete(product)
                            }
                            aria-label={`Delete ${product.name} (${product.sku})`}
                            className={`${buttonClass} bg-red-50 text-red-700 hover:bg-red-100`}
                          >
                            {deletingId === product.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredProducts.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-slate-500"
                      >
                        {products.length === 0
                          ? "No products have been added yet."
                          : "No products match your search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              Showing {filteredProducts.length} of{" "}
              {products.length} products
            </p>
          </>
        )}
      </section>
    </div>
  );
}
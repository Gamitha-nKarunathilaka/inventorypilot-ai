import { useEffect, useState } from "react";

const emptyForm = {
  name: "",
  sku: "",
  categoryId: "",
  price: "",
  quantity: "0",
  reorderLevel: "0",
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";

export default function AddProductForm({ onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Could not load categories. HTTP status: ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("The categories response was not valid.");
        }

        if (!controller.signal.aborted) {
          setCategories(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setCategoryError(
            err instanceof Error
              ? err.message
              : "Could not load categories."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => controller.abort();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      saving ||
      categoriesLoading ||
      categoryError ||
      categories.length === 0
    ) {
      return;
    }

    setError("");
    setSuccess("");

    const newProduct = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      categoryId: Number(form.categoryId),
      price: Number(form.price),
      quantity: Number(form.quantity),
      reorderLevel: Number(form.reorderLevel),
    };

    if (
      !newProduct.name ||
      !newProduct.sku ||
      newProduct.categoryId < 1
    ) {
      setError("Product name, SKU, and category are required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newProduct),
      });

      if (!response.ok) {
        const details = await response.json().catch(() => null);

        const message =
          typeof details === "string"
            ? details
            : details?.detail ??
              details?.title ??
              `Could not save product. HTTP status: ${response.status}`;

        throw new Error(message);
      }

      setForm(emptyForm);
      setSuccess("Product saved successfully.");

      onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the request."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-xl font-semibold">
        Add Product
      </h3>

      {categoriesLoading && (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Loading categories...
        </p>
      )}

      {categoryError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {categoryError}
        </p>
      )}

      {!categoriesLoading &&
        !categoryError &&
        categories.length === 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Create a category before adding a product.
          </p>
        )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset
          disabled={
            saving ||
            categoriesLoading ||
            Boolean(categoryError) ||
            categories.length === 0
          }
          className="grid gap-4 sm:grid-cols-2"
        >
          <legend className="sr-only">Product details</legend>

          <label className="text-sm font-medium">
            Product name
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              required
              maxLength={100}
              className={inputClass}
            />
          </label>

          <label className="text-sm font-medium">
            SKU
            <input
              name="sku"
              type="text"
              value={form.sku}
              onChange={handleChange}
              required
              maxLength={50}
              className={inputClass}
            />
          </label>

          <label className="text-sm font-medium">
            Category
            <select
              name="categoryId"
              value={form.categoryId}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">Select a category</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Price (LKR)
            <input
              name="price"
              type="number"
              value={form.price}
              onChange={handleChange}
              required
              min="0"
              max="999999999.99"
              step="0.01"
              className={inputClass}
            />
          </label>

          <label className="text-sm font-medium">
            Quantity
            <input
              name="quantity"
              type="number"
              value={form.quantity}
              onChange={handleChange}
              required
              min="0"
              max="2147483647"
              step="1"
              className={inputClass}
            />
          </label>

          <label className="text-sm font-medium">
            Reorder level
            <input
              name="reorderLevel"
              type="number"
              value={form.reorderLevel}
              onChange={handleChange}
              required
              min="0"
              max="2147483647"
              step="1"
              className={inputClass}
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Product"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
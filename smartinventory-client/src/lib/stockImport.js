const MAX_INT = 2147483647;
const MAX_PRICE = 999999999.99;

export const skuKey = (value) =>
  String(value ?? "").trim().toLowerCase();

export async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 30000
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readList(url) {
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(
      `Could not load ${url}. HTTP ${response.status}.`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`${url} must return an array.`);
  }

  return data;
}

export async function loadImportCatalog() {
  const [categories, products] = await Promise.all([
    readList("/api/categories"),
    readList("/api/products"),
  ]);

  const invalidCategories = categories.some(
    (item) =>
      !Number.isInteger(item.id) ||
      item.id <= 0 ||
      typeof item.name !== "string"
  );

  const invalidProducts = products.some(
    (item) => typeof item.sku !== "string"
  );

  if (invalidCategories || invalidProducts) {
    throw new Error(
      "The inventory API returned an unexpected category or product format."
    );
  }

  return { categories, products };
}

export function makeDraftRows(
  products,
  categories,
  existingProducts
) {
  const existing = new Set(
    existingProducts.map((product) =>
      skuKey(product.sku)
    )
  );

  return products.map((product, index) => {
    const matches = categories.filter(
      (category) =>
        skuKey(category.name) ===
          skuKey(product.category) &&
        product.category
    );

    const lkr = skuKey(product.currency) === "lkr";
    const notes = [product.notes];

    if (product.price != null && !lkr) {
      notes.push(
        `Source price: ${product.price} ${
          product.currency || "(currency unspecified)"
        }. Enter the verified LKR unit price.`
      );
    }

    return {
      id: String(index),
      name: product.name ?? "",
      sku: product.sku ?? "",

      categoryId:
        matches.length === 1
          ? String(matches[0].id)
          : "",

      price:
        lkr && product.price != null
          ? String(product.price)
          : "",

      quantity:
        product.quantity == null
          ? ""
          : String(product.quantity),

      reorderLevel:
        product.reorderLevel == null
          ? ""
          : String(product.reorderLevel),

      sourcePage: product.source_page,
      notes: notes.filter(Boolean).join(" "),
      selected: !existing.has(skuKey(product.sku)),
      status: "ready",
      result: "",
    };
  });
}

export function validateDraftRows(rows, categories) {
  const errors = {};

  const selected = rows.filter(
    (row) =>
      row.selected &&
      !["saved", "unknown"].includes(row.status)
  );

  const counts = new Map();

  selected.forEach((row) => {
    const key = skuKey(row.sku);

    counts.set(
      key,
      (counts.get(key) || 0) + 1
    );
  });

  for (const row of selected) {
    const problems = [];

    if (
      !row.name.trim() ||
      row.name.trim().length > 100
    ) {
      problems.push("Name: 1–100 characters.");
    }

    if (
      !row.sku.trim() ||
      row.sku.trim().length > 50
    ) {
      problems.push("SKU: 1–50 characters.");
    }

    if (counts.get(skuKey(row.sku)) > 1) {
      problems.push(
        "This SKU occurs more than once in the selected rows."
      );
    }

    if (
      !categories.some(
        (category) =>
          category.id === Number(row.categoryId)
      )
    ) {
      problems.push("Choose an existing category.");
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(row.price.trim()) ||
      Number(row.price) > MAX_PRICE
    ) {
      problems.push(
        "Enter a valid LKR unit price with at most 2 decimal places."
      );
    }

    for (const field of [
      "quantity",
      "reorderLevel",
    ]) {
      if (
        !/^\d+$/.test(row[field].trim()) ||
        Number(row[field]) > MAX_INT
      ) {
        problems.push(
          `${field}: enter a non-negative whole number.`
        );
      }
    }

    if (problems.length) {
      errors[row.id] = problems.join(" ");
    }
  }

  return errors;
}

export async function saveDraftRows(
  rows,
  onRow,
  isActive = () => true
) {
  const { categories, products } =
    await loadImportCatalog();

  const errors = validateDraftRows(
    rows,
    categories
  );

  const catalog = { categories, products };

  if (Object.keys(errors).length) {
    return {
      catalog,
      errors,
      saved: 0,
      skipped: 0,
      failed: 0,
      unknown: 0,
    };
  }

  const existing = new Set(
    products.map((product) =>
      skuKey(product.sku)
    )
  );

  const summary = {
    catalog,
    errors: {},
    saved: 0,
    skipped: 0,
    failed: 0,
    unknown: 0,
  };

  for (const row of rows) {
    if (!isActive()) {
      break;
    }

    if (
      !row.selected ||
      ["saved", "unknown"].includes(row.status)
    ) {
      continue;
    }

    if (existing.has(skuKey(row.sku))) {
      summary.skipped += 1;

      onRow(
        row.id,
        "exists",
        "SKU already exists. No change was made."
      );

      continue;
    }

    onRow(row.id, "saving", "Saving…");

    let response;

    try {
      response = await fetchWithTimeout(
        "/api/products",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            name: row.name.trim(),
            sku: row.sku.trim(),
            categoryId: Number(row.categoryId),
            price: Number(row.price),
            quantity: Number(row.quantity),
            reorderLevel: Number(row.reorderLevel),
          }),
        }
      );
    } catch {
      summary.unknown += 1;

      onRow(
        row.id,
        "unknown",
        "No response received. Check Inventory before importing this SKU again."
      );

      break;
    }

    if (
      response.status === 200 ||
      response.status === 201
    ) {
      summary.saved += 1;

      existing.add(skuKey(row.sku));

      onRow(
        row.id,
        "saved",
        "Saved successfully."
      );
    } else if (
      response.status >= 500 ||
      response.status === 408 ||
      response.status < 400
    ) {
      summary.unknown += 1;

      onRow(
        row.id,
        "unknown",
        `HTTP ${response.status}: outcome is uncertain. Check Inventory before trying again.`
      );

      break;
    } else {
      summary.failed += 1;

      onRow(
        row.id,
        "error",
        `Save rejected (HTTP ${response.status}). Check the row and API validation before retrying.`
      );

      break;
    }
  }

  return summary;
}
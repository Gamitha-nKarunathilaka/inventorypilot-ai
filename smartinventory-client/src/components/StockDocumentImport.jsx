import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  fetchWithTimeout,
  loadImportCatalog,
  makeDraftRows,
  saveDraftRows,
  skuKey,
  validateDraftRows,
} from "../lib/stockImport.js";

const inputClass = `
  w-full rounded-lg border border-slate-600
  bg-slate-950 px-2 py-2 text-sm text-slate-100
  outline-none focus:border-cyan-400
  disabled:opacity-50
`;

const buttonClass = `
  rounded-lg px-4 py-2 text-sm font-medium
  disabled:cursor-not-allowed disabled:opacity-50
`;

export default function StockDocumentImport({
  onInventoryChanged,
  disabled = false,
}) {
  const dialogRef = useRef(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const prefix = useId();

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [phase, setPhase] = useState("idle");
  const [rows, setRows] = useState([]);

  const [catalog, setCatalog] = useState({
    categories: [],
    products: [],
  });

  const [warnings, setWarnings] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const busy = phase !== "idle";

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setSourceUrl("");
      return;
    }

    const url = URL.createObjectURL(file);

    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const existing = new Set(
    catalog.products.map((product) =>
      skuKey(product.sku)
    )
  );

  const selectedCount = rows.filter(
    (row) =>
      row.selected &&
      !["saved", "unknown"].includes(row.status)
  ).length;

  function chooseFile(event) {
    const next = event.target.files?.[0] ?? null;

    setRows([]);
    setWarnings([]);
    setRowErrors({});
    setNotice("");
    setError("");

    if (next && next.size > 8 * 1024 * 1024) {
      setFile(null);
      setError("Choose a file smaller than 8 MB.");
      return;
    }

    setFile(next);
  }

  async function scanDocument() {
    if (!file || busyRef.current) {
      return;
    }

    busyRef.current = true;

    setPhase("scanning");
    setError("");
    setNotice("");
    setRows([]);
    setRowErrors({});
    setWarnings([]);

    try {
      const fresh = await loadImportCatalog();

      const body = new FormData();
      body.append("file", file);

      const response = await fetchWithTimeout(
        "/chat/import-preview",
        {
          method: "POST",
          body,
        },
        60000
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `Document scan failed. HTTP ${response.status}.`
        );
      }

      if (
        !Array.isArray(data?.products) ||
        data.products.length > 50
      ) {
        throw new Error(
          "The scan returned an unexpected product list."
        );
      }

      if (!mounted.current) {
        return;
      }

      setCatalog(fresh);

      setRows(
        makeDraftRows(
          data.products,
          fresh.categories,
          fresh.products
        )
      );

      setWarnings([
        ...(Array.isArray(data.warnings)
          ? data.warnings.filter(
              (value) => typeof value === "string"
            )
          : []),

        ...(data.has_more_rows
          ? [
              "This preview is partial. Split the document into smaller files to import the remaining rows.",
            ]
          : []),
      ]);

      setNotice(
        data.products.length
          ? `${data.products.length} rows found. Review every selected row before saving.`
          : "No product rows were found. Try a clearer stock list."
      );
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not scan the document."
        );
      }
    } finally {
      busyRef.current = false;

      if (mounted.current) {
        setPhase("idle");
      }
    }
  }

  function editRow(id, field, value) {
    setRows((previous) =>
      previous.map((row) => {
        if (
          row.id !== id ||
          ["saved", "unknown"].includes(row.status)
        ) {
          return row;
        }

        const selected =
          field === "sku" &&
          existing.has(skuKey(value))
            ? false
            : field === "selected"
              ? value
              : row.selected;

        return {
          ...row,
          [field]: value,
          selected,
          status: "ready",
          result: "",
        };
      })
    );

    setRowErrors((previous) => ({
      ...previous,
      [id]: "",
    }));
  }

  async function saveSelected() {
    if (busyRef.current || !selectedCount) {
      return;
    }

    const problems = validateDraftRows(
      rows,
      catalog.categories
    );

    setRowErrors(problems);

    if (Object.keys(problems).length) {
      setError(
        "Complete or correct the highlighted rows, or deselect them."
      );

      return;
    }

    busyRef.current = true;

    setPhase("saving");
    setError("");
    setNotice("");

    let inventoryChanged = false;

    try {
      const summary = await saveDraftRows(
        rows,

        (id, status, result) => {
          if (status === "saved") {
            inventoryChanged = true;
          }

          if (!mounted.current) {
            return;
          }

          setRows((previous) =>
            previous.map((row) =>
              row.id === id
                ? {
                    ...row,
                    status,
                    result,

                    selected: [
                      "saved",
                      "unknown",
                      "exists",
                    ].includes(status)
                      ? false
                      : row.selected,
                  }
                : row
            )
          );
        },

        () => mounted.current
      );

      if (!mounted.current) {
        return;
      }

      setCatalog(summary.catalog);
      setRowErrors(summary.errors);

      if (Object.keys(summary.errors).length) {
        setError(
          "The category list or selected rows changed. Review the highlighted rows."
        );
      } else {
        setNotice(
          `Saved: ${summary.saved}. ` +
            `Existing SKUs skipped: ${summary.skipped}. ` +
            `Rejected: ${summary.failed}. ` +
            `Uncertain: ${summary.unknown}.`
        );

        if (summary.failed || summary.unknown) {
          setError(
            "Import stopped at the first unsuccessful row. Earlier successful rows are saved; later rows were not attempted."
          );
        }
      }
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Import could not be completed."
        );
      }
    } finally {
      busyRef.current = false;

      if (mounted.current) {
        setPhase("idle");
      }

      if (inventoryChanged) {
        onInventoryChanged?.();
      }
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        className={`
          ${buttonClass}
          w-full border border-cyan-800
          bg-cyan-950/60 text-cyan-100
          hover:bg-cyan-900/60
        `}
      >
        Upload stock list
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${prefix}-title`}
        onCancel={(event) => {
          if (busyRef.current) {
            event.preventDefault();
          }
        }}
        className="
          m-auto max-h-[92dvh] w-[min(96vw,1280px)]
          max-w-none overflow-hidden rounded-2xl
          border border-slate-700 bg-[#071726]
          p-0 text-slate-100 shadow-2xl
          backdrop:bg-slate-950/80
        "
      >
        <div className="flex max-h-[92dvh] flex-col">
          <header
            className="
              flex shrink-0 items-start justify-between
              gap-4 border-b border-slate-700 px-5 py-4
            "
          >
            <div>
              <h2
                id={`${prefix}-title`}
                className="text-xl font-semibold"
              >
                Jarvis · Import stock document
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Upload → review → save new products.
              </p>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => dialogRef.current?.close()}
              className={`
                ${buttonClass}
                border border-slate-600
              `}
            >
              Close
            </button>
          </header>

          <div
            className="
              min-h-0 flex-1 space-y-4
              overflow-y-auto p-5
            "
          >
            <div
              className="
                rounded-xl border border-dashed
                border-slate-600 bg-slate-950/40 p-4
              "
            >
              <label
                htmlFor={`${prefix}-file`}
                className="block text-sm font-medium"
              >
                Stock photo or PDF
              </label>

              <input
                id={`${prefix}-file`}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={busy}
                onChange={chooseFile}
                className="
                  mt-3 block w-full text-sm
                  file:mr-3 file:rounded-lg file:border-0
                  file:bg-cyan-600 file:px-3 file:py-2
                  file:text-white
                "
              />

              <p className="mt-2 text-xs leading-5 text-slate-400">
                JPG, PNG, WebP or PDF · up to 8 MB /
                10 PDF pages / 50 rows per scan.
                This file is sent to Gemini to read
                the product details.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!file || busy}
                  onClick={scanDocument}
                  className={`
                    ${buttonClass}
                    bg-cyan-500 text-slate-950
                    hover:bg-cyan-400
                  `}
                >
                  {phase === "scanning"
                    ? "Reading document…"
                    : "Scan with Jarvis"}
                </button>

                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-cyan-300 underline"
                  >
                    View source document
                  </a>
                )}
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="
                  rounded-lg border border-red-800
                  bg-red-950/50 p-3 text-sm text-red-200
                "
              >
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                className="
                  rounded-lg border border-cyan-900
                  bg-cyan-950/30 p-3 text-sm text-cyan-100
                "
              >
                {notice}
              </p>
            )}

            {warnings.map((warning, index) => (
              <p
                key={index}
                className="
                  rounded-lg bg-amber-950/40
                  p-3 text-sm text-amber-200
                "
              >
                {warning}
              </p>
            ))}

            {rows.length > 0 && (
              <>
                <p className="text-sm leading-6 text-slate-300">
                  Check the original document and correct
                  the values below. Missing fields stay blank.
                  Enter individual stock units and the verified
                  LKR unit price. Existing SKUs are skipped;
                  their current quantities will not be changed.
                </p>

                <div
                  className="
                    overflow-x-auto rounded-xl
                    border border-slate-700
                  "
                >
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="bg-slate-900 text-xs text-slate-300">
                      <tr>
                        {[
                          "Add",
                          "Product name",
                          "SKU",
                          "Category",
                          "Price (LKR)",
                          "Quantity",
                          "Reorder level",
                          "Review / result",
                        ].map((label) => (
                          <th
                            key={label}
                            scope="col"
                            className="px-3 py-3"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                      {rows.map((row, index) => {
                        const locked =
                          busy ||
                          ["saved", "unknown"].includes(
                            row.status
                          );

                        const duplicate = existing.has(
                          skuKey(row.sku)
                        );

                        return (
                          <tr
                            key={row.id}
                            className={
                              rowErrors[row.id]
                                ? "bg-red-950/20"
                                : "bg-slate-950/20"
                            }
                          >
                            <td className="px-3 py-3 align-top">
                              <input
                                type="checkbox"
                                aria-label={`Select row ${index + 1}`}
                                checked={row.selected}
                                disabled={
                                  locked ||
                                  (duplicate && !row.selected)
                                }
                                onChange={(event) =>
                                  editRow(
                                    row.id,
                                    "selected",
                                    event.target.checked
                                  )
                                }
                                className="mt-3 h-4 w-4 accent-cyan-400"
                              />
                            </td>

                            {["name", "sku"].map((field) => (
                              <td
                                key={field}
                                className="min-w-36 px-2 py-3 align-top"
                              >
                                <input
                                  type="text"
                                  aria-label={`${field}, row ${index + 1}`}
                                  value={row[field]}
                                  disabled={locked}
                                  onChange={(event) =>
                                    editRow(
                                      row.id,
                                      field,
                                      event.target.value
                                    )
                                  }
                                  className={inputClass}
                                />
                              </td>
                            ))}

                            <td className="min-w-36 px-2 py-3 align-top">
                              <select
                                aria-label={`Category, row ${index + 1}`}
                                value={row.categoryId}
                                disabled={locked}
                                onChange={(event) =>
                                  editRow(
                                    row.id,
                                    "categoryId",
                                    event.target.value
                                  )
                                }
                                className={inputClass}
                              >
                                <option value="">
                                  Choose category
                                </option>

                                {catalog.categories.map(
                                  (category) => (
                                    <option
                                      key={category.id}
                                      value={category.id}
                                    >
                                      {category.name}
                                    </option>
                                  )
                                )}
                              </select>
                            </td>

                            {[
                              "price",
                              "quantity",
                              "reorderLevel",
                            ].map((field) => (
                              <td
                                key={field}
                                className="min-w-24 px-2 py-3 align-top"
                              >
                                <input
                                  type="text"
                                  inputMode={
                                    field === "price"
                                      ? "decimal"
                                      : "numeric"
                                  }
                                  aria-label={`${field}, row ${index + 1}`}
                                  value={row[field]}
                                  disabled={locked}
                                  onChange={(event) =>
                                    editRow(
                                      row.id,
                                      field,
                                      event.target.value
                                    )
                                  }
                                  className={inputClass}
                                />
                              </td>
                            ))}

                            <td
                              className="
                                min-w-52 max-w-72 space-y-1
                                px-3 py-3 align-top
                                text-xs leading-5
                              "
                            >
                              <p className="text-slate-400">
                                Source page {row.sourcePage}
                              </p>

                              {row.notes && (
                                <p>{row.notes}</p>
                              )}

                              {duplicate &&
                                row.status !== "saved" && (
                                  <p className="text-amber-200">
                                    SKU already exists.
                                  </p>
                                )}

                              {row.result && (
                                <p
                                  className={
                                    row.status === "saved"
                                      ? "text-emerald-300"
                                      : "text-amber-200"
                                  }
                                >
                                  {row.result}
                                </p>
                              )}

                              {rowErrors[row.id] && (
                                <p className="text-red-300">
                                  {rowErrors[row.id]}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <footer
            className="
              flex shrink-0 flex-wrap items-center
              justify-between gap-3 border-t
              border-slate-700 bg-[#071726] px-5 py-4
            "
          >
            <p className="text-xs text-slate-400">
              Review first. Products are saved individually
              through your Inventory API.
            </p>

            <button
              type="button"
              disabled={busy || !selectedCount}
              onClick={saveSelected}
              className={`
                ${buttonClass}
                bg-cyan-500 text-slate-950
                hover:bg-cyan-400
              `}
            >
              {phase === "saving"
                ? "Saving products…"
                : `Save selected (${selectedCount})`}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
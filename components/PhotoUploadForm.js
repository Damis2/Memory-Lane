"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addToast, ToastContainer } from "./Toast";

/* ── helpers ─────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

function fileKind(file) {
  return file.type.startsWith("video/") ? "video" : "image";
}

/* ── Icons ───────────────────────────────────────────────────────── */
const IconVideo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="15" height="10" rx="2" />
    <path d="M17 9l5-3v12l-5-3V9z" />
  </svg>
);
const IconUpload = () => (
  <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconRemove = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── Per-file AI panel ───────────────────────────────────────────── */
function AiPanel({ item, onUpdate }) {
  // Nothing runs until the user clicks. Model loads client-side only.
  // This is the same privacy-preserving approach as the original single-file form.
  async function handleRunAi() {
    onUpdate(item.id, { aiStatus: "loading-model" });
    try {
      const [tf, mobilenetModule] = await Promise.all([
        import("@tensorflow/tfjs"),
        import("@tensorflow-models/mobilenet"),
      ]);
      void tf; // side-effect import
      const model = await mobilenetModule.load();
      onUpdate(item.id, { aiStatus: "classifying" });
      const imgEl = document.getElementById(`ai-preview-${item.id}`);
      const predictions = await model.classify(imgEl);
      const suggestions = predictions.slice(0, 5).map((p) => ({
        label: p.className.split(",")[0],
        probability: p.probability,
      }));
      onUpdate(item.id, { aiStatus: "done", aiSuggestions: suggestions });
    } catch (e) {
      console.error(e);
      onUpdate(item.id, { aiStatus: "error" });
    }
  }

  function toggleTag(label) {
    const next = new Set(item.selectedTags);
    next.has(label) ? next.delete(label) : next.add(label);
    onUpdate(item.id, { selectedTags: next });
  }

  const { aiStatus, aiSuggestions, selectedTags, previewUrl, kind } = item;

  if (kind === "video") {
    return (
      <div className="ai-box">
        <div className="ai-box-head"><h3>AI suggestions</h3></div>
        <p className="ai-note">AI tag suggestions are only available for images. Use the category field above for this video.</p>
      </div>
    );
  }

  return (
    <div className="ai-box">
      <div className="ai-box-head"><h3>Optional AI suggestions</h3></div>
      <p className="ai-note">
        Off by default. Click below to load a MobileNet model in <em>your browser</em> and classify this photo locally — nothing leaves your device for this step. You choose which tags to keep.
      </p>

      {/* Hidden img used by TF.js — must be in DOM, can be tiny */}
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          id={`ai-preview-${item.id}`}
          src={previewUrl}
          alt=""
          crossOrigin="anonymous"
          style={{ display: "none" }}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        className="btn btn-sm"
        onClick={handleRunAi}
        disabled={!item.file || aiStatus === "loading-model" || aiStatus === "classifying"}
      >
        {aiStatus === "loading-model" && "Loading model…"}
        {aiStatus === "classifying" && "Classifying…"}
        {(aiStatus === "idle" || aiStatus === "done" || aiStatus === "error") && "Suggest tags with AI"}
      </button>

      {aiStatus === "error" && (
        <p className="error-text" style={{ marginTop: 8, marginBottom: 0 }}>
          Couldn't run the classifier. You can still tag manually.
        </p>
      )}

      {aiSuggestions.length > 0 && (
        <div className="tag-suggestions">
          {aiSuggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="tag-pill"
              data-selected={selectedTags.has(s.label)}
              onClick={() => toggleTag(s.label)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Single batch item card ─────────────────────────────────────── */
function BatchItemCard({ item, globalCategory, categories, onUpdate, onRemove }) {
  // Category: use per-item override if set, else fall back to global
  const categoryValue = item.categoryOverride !== null ? item.categoryOverride : globalCategory;

  function handleCategoryChange(val) {
    onUpdate(item.id, { categoryOverride: val });
  }

  const isActive = item.status === "uploading";
  const isDone = item.status === "done";
  const isError = item.status === "error";

  return (
    <div className="batch-item">
      <div className="batch-item-header">
        {/* Thumbnail */}
        {item.kind === "image" && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="batch-thumb" src={item.previewUrl} alt={item.file.name} />
        ) : (
          <div className="batch-thumb-video">
            <IconVideo />
          </div>
        )}

        <div className="batch-item-info">
          <div className="batch-filename" title={item.file.name}>{item.file.name}</div>
          <div className="batch-filesize">{formatBytes(item.file.size)}</div>
          <div className={`batch-status ${item.status}`}>
            {isDone && <><IconCheck /> Done</>}
            {isError && item.error}
            {isActive && "Uploading…"}
            {item.status === "queued" && "Queued"}
          </div>
        </div>

        {/* Remove button — only when not uploading/done */}
        {item.status === "queued" && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.file.name}`}
            title="Remove"
          >
            <IconRemove />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="batch-progress">
          <div className="batch-progress-fill" style={{ width: `${item.progress}%` }} />
        </div>
      )}

      {/* Category + AI — only shown while queued */}
      {item.status === "queued" && (
        <div className="batch-item-fields">
          <div className="batch-category-row">
            <label htmlFor={`cat-${item.id}`}>Category</label>
            <input
              id={`cat-${item.id}`}
              list={`cat-options-${item.id}`}
              value={categoryValue}
              onChange={(e) => handleCategoryChange(e.target.value)}
              placeholder={globalCategory ? `${globalCategory} (batch default)` : "e.g. Beach trip 2026"}
            />
            <datalist id={`cat-options-${item.id}`}>
              {categories.map((c) => (
                <option value={c.name} key={c.id} />
              ))}
            </datalist>
          </div>

          <AiPanel item={item} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function PhotoUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [items, setItems] = useState([]); // BatchItem[]
  const [globalCategory, setGlobalCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((data) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  /* ── File management ─────────────────────────────────────────── */
  function addFiles(fileList) {
    const newItems = Array.from(fileList).map((file) => ({
      id: makeId(),
      file,
      kind: fileKind(file),
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      categoryOverride: null, // null = use global
      status: "queued",
      progress: 0,
      error: null,
      aiStatus: "idle",
      aiSuggestions: [],
      selectedTags: new Set(),
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function handleInputChange(e) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = ""; // allow re-selecting same files
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }

  /* ── Drag-and-drop ───────────────────────────────────────────── */
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  /* ── Upload ──────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    const queued = items.filter((it) => it.status === "queued");
    if (queued.length === 0) return;

    setUploading(true);

    // Track outcomes locally — don't rely on stale `items` state after
    // the loop, since React state updates are asynchronous.
    let succeeded = 0;
    let failed = 0;

    for (const item of queued) {
      updateItem(item.id, { status: "uploading", progress: 20 });

      const categoryName = (
        item.categoryOverride !== null ? item.categoryOverride : globalCategory
      ).trim();
      const keptTags = Array.from(item.selectedTags);

      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("categoryName", categoryName);
      formData.append("aiConsent", keptTags.length > 0 ? "true" : "false");
      formData.append("aiTags", keptTags.join(", "));

      // Simulate progress during upload (we don't have byte-level XHR
      // progress here, so we animate to 50% then jump to 100% on done).
      updateItem(item.id, { progress: 50 });

      try {
        const res = await fetch("/api/photos", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateItem(item.id, {
            status: "error",
            error: data.error || "Upload failed",
            progress: 0,
          });
          failed++;
        } else {
          updateItem(item.id, { status: "done", progress: 100 });
          succeeded++;
        }
      } catch {
        updateItem(item.id, { status: "error", error: "Network error", progress: 0 });
        failed++;
      }
    }

    setUploading(false);
    setAllDone(true);

    if (failed === 0) {
      addToast(`${succeeded} file${succeeded === 1 ? "" : "s"} uploaded successfully.`, "success");
    } else {
      addToast(`${succeeded} uploaded, ${failed} failed.`, "error");
    }

  }

  const queuedCount = items.filter((it) => it.status === "queued").length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const errorCount = items.filter((it) => it.status === "error").length;

  return (
    <>
      <ToastContainer />
      <form className="upload-card" onSubmit={handleSubmit}>
        {/* Batch-level category */}
        {items.length > 0 && (
          <div className="upload-batch-header">
            <h2>Batch category (applies to all)</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="global-category"
                list="global-category-options"
                value={globalCategory}
                onChange={(e) => setGlobalCategory(e.target.value)}
                placeholder="e.g. Beach trip 2026 — override per file below"
                style={{
                  flex: 1,
                  fontSize: 14,
                  padding: "8px 12px",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-raised)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                }}
              />
              <datalist id="global-category-options">
                {categories.map((c) => (
                  <option value={c.name} key={c.id} />
                ))}
              </datalist>
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div
          className={`dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="file-input"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo"
            onChange={handleInputChange}
          />
          <IconUpload />
          <p className="dropzone-hint">
            <strong>Click to choose</strong> or drag and drop files here
          </p>
          <p className="dropzone-limits">
            Photos up to 25 MB · Videos up to 4 GB — mix of both is fine
          </p>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div className="batch-list">
            {items.map((item) => (
              <BatchItemCard
                key={item.id}
                item={item}
                globalCategory={globalCategory}
                categories={categories}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="upload-footer">
            <div className="upload-summary">
              {!allDone && queuedCount > 0 && (
                <>{queuedCount} file{queuedCount === 1 ? "" : "s"} ready to upload</>
              )}
              {allDone && (
                <>
                  {doneCount > 0 && <>{doneCount} uploaded</>}
                  {errorCount > 0 && <>, {errorCount} failed</>}
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {allDone && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => router.push("/gallery")}
                >
                  Go to gallery
                </button>
              )}
              {!allDone && queuedCount > 0 && (
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={uploading}
                >
                  {uploading
                    ? "Uploading…"
                    : `Upload ${queuedCount} file${queuedCount === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </>
  );
}

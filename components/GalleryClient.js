"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { addToast, ToastContainer } from "./Toast";

/* ── helpers ─────────────────────────────────────────────────────── */

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function SkeletonGrid() {
  return (
    <div className="contact-sheet">
      {Array.from({ length: 12 }).map((_, i) => (
        <div className="skeleton-card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-media" />
          <div className="skeleton-footer">
            <div className="skeleton skeleton-line" style={{ width: "60%" }} />
            <div className="skeleton skeleton-line" style={{ width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Icons (inline SVG) ──────────────────────────────────────────── */
const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,0.4)" />
    <polygon points="10,8 10,16 17,12" fill="white" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconZip = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IconDatabase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);
const IconPencil = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

/* ── Lightbox ─────────────────────────────────────────────────────── */
function Lightbox({ photo, photos, onClose, onPrev, onNext }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  const idx = photos.findIndex((p) => p.id === photo.id);
  const canPrev = idx > 0;
  const canNext = idx < photos.length - 1;

  return (
    <div
      className="lightbox-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${photo.originalName}`}
    >
      <button className="lightbox-close" onClick={onClose} aria-label="Close lightbox">
        <IconClose />
      </button>

      {canPrev && (
        <button className="lightbox-nav lightbox-prev" onClick={onPrev} aria-label="Previous photo">
          <IconChevronLeft />
        </button>
      )}
      {canNext && (
        <button className="lightbox-nav lightbox-next" onClick={onNext} aria-label="Next photo">
          <IconChevronRight />
        </button>
      )}

      <div className="lightbox-content">
        {photo.kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            className="lightbox-video"
            controls
            autoPlay
            src={`/api/photos/${photo.id}/file`}
            poster={`/api/photos/${photo.id}/file?thumb=1`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="lightbox-img"
            src={`/api/photos/${photo.id}/file`}
            alt={photo.originalName}
          />
        )}
      </div>

      <div className="lightbox-caption">
        {photo.originalName}
        {photo.category && ` · ${photo.category.name}`}
        {" · "}uploaded by {photo.uploader.username}
        {idx >= 0 && ` · ${idx + 1} / ${photos.length}`}
      </div>
    </div>
  );
}

/* ── ReCategorize inline form ────────────────────────────────────── */
function ReCatForm({ photo, categories, onSave, onCancel }) {
  const [value, setValue] = useState(photo.category?.name || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName: value.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        addToast(d.error || "Could not update category.", "error");
        return;
      }
      const updated = await res.json();
      addToast("Category updated.", "success");
      onSave(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="recat-form">
      <input
        className="recat-input"
        list="recat-options"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Category name (leave blank to remove)"
        autoFocus
      />
      <datalist id="recat-options">
        {categories.map((c) => (
          <option value={c.name} key={c.id} />
        ))}
      </datalist>
      <button className="btn btn-sm btn-primary" type="button" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button className="btn btn-sm btn-ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
/* ── Rename modal ────────────────────────────────────────────────── */
function RenameModal({ items, onSave, onCancel }) {
  // items: [{ id, originalName }] for all selected photos the user owns
  const [names, setNames] = useState(() =>
    Object.fromEntries(items.map((it) => [it.id, it.originalName]))
  );
  const [baseName, setBaseName] = useState("");
  const [saving, setSaving] = useState(false);

  function applyBaseName() {
    const trimmed = baseName.trim();
    if (!trimmed) return;
    const updated = {};
    items.forEach((it, idx) => {
      updated[it.id] = `${trimmed} ${idx + 1}`;
    });
    setNames(updated);
  }

  async function handleSave() {
    const renames = items
      .map((it) => ({ id: it.id, name: names[it.id] ?? it.originalName }))
      .filter((r) => r.name.trim());
    if (renames.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/photos/bulk-rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renames }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || "Rename failed.", "error");
        return;
      }
      onSave(data.updatedIds, renames);
      if (data.updatedIds.length > 0)
        addToast(`${data.updatedIds.length} item${data.updatedIds.length === 1 ? "" : "s"} renamed.`, "success");
      if (data.skippedIds?.length > 0)
        addToast(`${data.skippedIds.length} item${data.skippedIds.length === 1 ? " wasn't" : "s weren't"} renamed — you can only rename your own uploads.`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Rename photos">
      <div className="modal-box">
        <div className="modal-header">
          <h2>Rename {items.length} item{items.length === 1 ? "" : "s"}</h2>
          <button className="btn-icon" type="button" onClick={onCancel} aria-label="Close">
            <IconClose />
          </button>
        </div>

        {/* Apply-to-all helper */}
        <div className="rename-base-row">
          <input
            className="rename-base-input"
            placeholder="Base name (e.g. Beach Trip) → applies to all with a number"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyBaseName()}
          />
          <button className="btn btn-sm" type="button" onClick={applyBaseName}>
            Apply to all
          </button>
        </div>

        {/* Per-item inputs */}
        <div className="rename-list">
          {items.map((it) => (
            <div className="rename-item" key={it.id}>
              <label className="rename-original" title={it.originalName}>
                {it.originalName}
              </label>
              <input
                className="rename-input"
                value={names[it.id] ?? it.originalName}
                maxLength={200}
                onChange={(e) => setNames((prev) => ({ ...prev, [it.id]: e.target.value }))}
                aria-label={`New name for ${it.originalName}`}
              />
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save names"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function GalleryClient({ currentUsername, initialStorageBytes }) {
  const [photos, setPhotos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Total count (from first-page API response)
  const [total, setTotal] = useState(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(null);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(false);

  // Bulk delete
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Bulk rename
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // Re-categorize
  const [recatPhotoId, setRecatPhotoId] = useState(null);

  // Delete confirmation (single item)
  const [confirmDelete, setConfirmDelete] = useState(null); // { id }

  // Storage
  const [storageBytes, setStorageBytes] = useState(initialStorageBytes ?? null);

  /* ── Data fetching ────────────────────────────────────────────── */
  const fetchPage = useCallback(async (categoryId, afterCursor, query) => {
    const params = new URLSearchParams();
    if (categoryId !== "all") params.set("categoryId", categoryId);
    if (afterCursor) params.set("cursor", afterCursor);
    if (query) params.set("q", query);
    const res = await fetch(`/api/photos?${params.toString()}`);
    if (!res.ok) throw new Error("Could not load photos. Try refreshing.");
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadFirstPage() {
      setLoading(true);
      setSelected(new Set());
      setTotal(null);
      try {
        const [{ photos: firstPage, nextCursor, total: pageTotal }, categoriesRes] = await Promise.all([
          fetchPage(activeCategory, null, searchQuery),
          fetch("/api/categories"),
        ]);
        if (cancelled) return;
        setPhotos(firstPage);
        setCursor(nextCursor);
        setHasMore(Boolean(nextCursor));
        if (pageTotal !== undefined) setTotal(pageTotal);
        if (categoriesRes.ok) {
          const catData = await categoriesRes.json();
          setCategories(catData.categories ?? catData);
          if (catData.uncategorizedCount !== undefined)
            setUncategorizedCount(catData.uncategorizedCount);
        }
      } catch (e) {
        if (!cancelled) addToast(e.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFirstPage();
    return () => { cancelled = true; };
  }, [activeCategory, fetchPage, searchQuery]);

  // Refresh storage stats when photos change
  useEffect(() => {
    fetch("/api/storage/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStorageBytes(d.totalBytes))
      .catch(() => {});
  }, [photos.length]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const { photos: nextPage, nextCursor } = await fetchPage(activeCategory, cursor, searchQuery);
      setPhotos((prev) => [...prev, ...nextPage]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (e) {
      addToast(e.message, "error");
    } finally {
      setLoadingMore(false);
    }
  }

  /* ── Delete ───────────────────────────────────────────────────── */
  function requestDelete(photoId) {
    setConfirmDelete({ id: photoId });
  }

  async function handleDeleteConfirmed() {
    const id = confirmDelete.id;
    setConfirmDelete(null);
    const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
      addToast("Photo deleted.", "success");
    } else {
      const d = await res.json().catch(() => ({}));
      addToast(d.error || "Could not delete that photo.", "error");
    }
  }

  /* ── Selection mode ──────────────────────────────────────────── */
  function enterSelectionMode() {
    setSelectionMode(true);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  // Selects only the items visible on the current page that belong to the
  // current user — mirrors the rule that only the uploader can delete.
  function selectAllMine() {
    const mine = photos
      .filter((p) => p.uploader.username === currentUsername)
      .map((p) => p.id);
    setSelected(new Set(mine));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  /* ── Bulk delete ──────────────────────────────────────────────── */
  async function handleBulkDeleteConfirmed() {
    setConfirmBulkDelete(false);
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      const res = await fetch("/api/photos/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || "Bulk delete failed.", "error");
        return;
      }
      const { deletedIds = [], skippedIds = [] } = data;
      if (deletedIds.length > 0) {
        setPhotos((prev) => prev.filter((p) => !deletedIds.includes(p.id)));
        setSelected((prev) => {
          const s = new Set(prev);
          deletedIds.forEach((id) => s.delete(id));
          return s;
        });
        addToast(
          `${deletedIds.length} item${deletedIds.length === 1 ? "" : "s"} deleted.`,
          "success"
        );
      }
      if (skippedIds.length > 0) {
        addToast(
          `${skippedIds.length} item${skippedIds.length === 1 ? " wasn't" : "s weren't"} deleted — you can only delete your own uploads.`,
          "error"
        );
      }
    } catch {
      addToast("Bulk delete failed.", "error");
    }
  }

  /* ── Batch rename ─────────────────────────────────────────────── */
  function openRenameModal() {
    setRenameModalOpen(true);
  }

  function handleRenameSave(updatedIds, renames) {
    const nameMap = Object.fromEntries(renames.map((r) => [r.id, r.name]));
    setPhotos((prev) =>
      prev.map((p) => (nameMap[p.id] ? { ...p, originalName: nameMap[p.id] } : p))
    );
    setRenameModalOpen(false);
  }

  /* ── Batch download ───────────────────────────────────────────── */
  async function handleBatchDownload() {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/photos/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        addToast(d.error || "Zip download failed.", "error");
        return;
      }
      // Stream the zip to a download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contact-sheet-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast(`Downloaded ${selected.size} file${selected.size === 1 ? "" : "s"}.`, "success");
    } catch {
      addToast("Zip download failed.", "error");
    } finally {
      setDownloading(false);
    }
  }

  /* ── Lightbox navigation ─────────────────────────────────────── */
  function openLightbox(photo) {
    setLightboxPhoto(photo);
  }
  function closeLightbox() {
    setLightboxPhoto(null);
  }
  function lightboxPrev() {
    const idx = photos.findIndex((p) => p.id === lightboxPhoto.id);
    if (idx > 0) setLightboxPhoto(photos[idx - 1]);
  }
  function lightboxNext() {
    const idx = photos.findIndex((p) => p.id === lightboxPhoto.id);
    if (idx < photos.length - 1) setLightboxPhoto(photos[idx + 1]);
  }

  /* ── Re-categorize ────────────────────────────────────────────── */
  function handleRecatSave(updatedPhoto) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === updatedPhoto.id ? { ...p, ...updatedPhoto } : p))
    );
    setRecatPhotoId(null);
  }

  /* ── Search debounce ─────────────────────────────────────────── */
  const searchTimeout = useRef(null);
  function handleSearchChange(e) {
    const q = e.target.value;
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearchQuery(q), 350);
  }

  /* ── Render ──────────────────────────────────────────────────── */
  const selectionActive = selected.size > 0;

  // Items available for renaming: selected photos that belong to the current user
  const renameItems = photos
    .filter((p) => selected.has(p.id) && p.uploader.username === currentUsername)
    .map((p) => ({ id: p.id, originalName: p.originalName }));

  return (
    <>
      <ToastContainer />

      {/* Lightbox */}
      {lightboxPhoto && (
        <Lightbox
          photo={lightboxPhoto}
          photos={photos}
          onClose={closeLightbox}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
        />
      )}

      {/* Single-item delete confirm */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete photo?"
        message="This removes the photo for everyone and can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`}
        message="This can't be undone."
        confirmLabel={`Delete ${selected.size}`}
        danger
        onConfirm={handleBulkDeleteConfirmed}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Rename modal */}
      {renameModalOpen && renameItems.length > 0 && (
        <RenameModal
          items={renameItems}
          onSave={handleRenameSave}
          onCancel={() => setRenameModalOpen(false)}
        />
      )}

      {/* Storage badge + total count */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {storageBytes != null && (
          <span className="storage-badge">
            <IconDatabase />
            {formatBytes(storageBytes)} used
          </span>
        )}
        {total !== null && (
          <span className="total-count-badge">
            {activeCategory !== "all" || searchQuery
              ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
              : `${total.toLocaleString()} photo${total === 1 ? "" : "s & videos"}`}
          </span>
        )}
      </div>

      {/* Toolbar: search + filters */}
      <div className="gallery-toolbar">
        <div className="toolbar-top-row">
          <div className="search-wrap">
            <IconSearch />
            <input
              type="search"
              className="search-input"
              placeholder="Search by name, category, or uploader…"
              onChange={handleSearchChange}
              aria-label="Search photos"
              id="gallery-search"
            />
          </div>

          {/* Select / Done toggle */}
          <button
            className={`btn btn-sm${selectionMode ? " btn-select-active" : ""}`}
            onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
            aria-pressed={selectionMode}
            id="gallery-select-toggle"
          >
            {selectionMode ? "Done" : "Select"}
          </button>
        </div>

        <div className="filter-row" role="group" aria-label="Filter by category">
          {[
            { id: "all", label: "All" },
            { id: "uncategorized", label: uncategorizedCount !== null ? `Uncategorized (${uncategorizedCount})` : "Uncategorized" },
            ...categories.map((c) => ({ id: c.id, label: `${c.name} (${c._count.photos})` })),
          ].map((item) => (
            <button
              key={item.id}
              className="chip"
              aria-pressed={activeCategory === item.id}
              onClick={() => setActiveCategory(item.id)}
            >
              {item.label}
            </button>
          ))}

          {selectionMode && (
            <>
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm btn-ghost" onClick={selectAllMine} id="gallery-select-all-mine">
                Select all mine
              </button>
              {selectionActive && (
                <button className="btn btn-sm btn-ghost" onClick={clearSelection} id="gallery-clear-selection">
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Gallery grid */}
      {loading ? (
        <SkeletonGrid />
      ) : photos.length === 0 ? (
        <div className="contact-sheet">
          <div className="empty-state">
            <h2>Nothing here yet</h2>
            <p>Upload some photos, or try a different filter or search.</p>
          </div>
        </div>
      ) : (
        <>
          <div className={`contact-sheet ${selectionMode ? "selection-active" : ""}`}>
            {photos.map((photo) => {
              const isSelected = selected.has(photo.id);
              const isRecat = recatPhotoId === photo.id;
              const duration = formatDuration(photo.durationSeconds);
              const isOwner = photo.uploader.username === currentUsername;

              return (
                <figure
                  key={photo.id}
                  className={`photo-card ${isSelected ? "is-selected" : ""}`}
                  style={{ cursor: "default" }}
                >
                  {/* Checkbox — only shown in selection mode, only enabled for the uploader */}
                  {selectionMode && isOwner && (
                    <div className="card-checkbox-wrap">
                      <input
                        type="checkbox"
                        className="card-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(photo.id)}
                        aria-label={`Select ${photo.originalName}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Media — click to open lightbox */}
                  <div
                    className="card-media"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${photo.originalName}`}
                    onClick={() => openLightbox(photo)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openLightbox(photo)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="card-img"
                      src={`/api/photos/${photo.id}/file?thumb=1`}
                      alt={photo.originalName}
                      loading="lazy"
                    />
                    {photo.kind === "video" && (
                      <div className="video-play-badge" aria-hidden="true">
                        <IconPlay />
                      </div>
                    )}
                    {photo.kind === "video" && duration && (
                      <span className="duration-badge mono">{duration}</span>
                    )}
                  </div>

                  {/* Footer */}
                  <figcaption className="card-footer">
                    <div className="card-meta">
                      <span className="card-uploader">{photo.uploader.username}</span>
                      <span className="card-category">
                        {photo.category ? photo.category.name : <em style={{ fontStyle: "normal", opacity: 0.6 }}>Uncategorized</em>}
                      </span>
                    </div>
                    <div className="card-actions">
                      <a
                        className="btn-icon"
                        href={`/api/photos/${photo.id}/file?download=1`}
                        title="Download"
                        aria-label={`Download ${photo.originalName}`}
                      >
                        <IconDownload />
                      </a>
                      <button
                        className="btn-icon"
                        type="button"
                        title="Change category"
                        aria-label="Edit category"
                        onClick={() => setRecatPhotoId(isRecat ? null : photo.id)}
                      >
                        <IconEdit />
                      </button>
                      {photo.uploader.username === currentUsername && (
                        <button
                          className="btn-icon"
                          type="button"
                          title="Delete"
                          aria-label={`Delete ${photo.originalName}`}
                          onClick={() => requestDelete(photo.id)}
                          style={{ color: "var(--error)", borderColor: "var(--error-border)" }}
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </figcaption>

                  {/* Inline re-categorize form */}
                  {isRecat && (
                    <ReCatForm
                      photo={photo}
                      categories={categories}
                      onSave={handleRecatSave}
                      onCancel={() => setRecatPhotoId(null)}
                    />
                  )}
                </figure>
              );
            })}
          </div>

          {hasMore && (
            <div className="load-more-wrap">
              <button className="btn" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Selection bar — shown whenever items are selected */}
      {selectionActive && (
        <div className="selection-bar" role="toolbar" aria-label="Batch actions">
          <span className="selection-bar-count">{selected.size} selected</span>
          <div className="selection-bar-sep" aria-hidden="true" />
          <button
            className="btn btn-primary"
            onClick={handleBatchDownload}
            disabled={downloading}
            id="gallery-batch-download"
          >
            <IconZip />
            {downloading ? "Preparing…" : "Download ZIP"}
          </button>
          {renameItems.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={openRenameModal}
              id="gallery-batch-rename"
            >
              <IconPencil />
              Rename selected ({renameItems.length})
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={() => setConfirmBulkDelete(true)}
            id="gallery-batch-delete"
          >
            <IconTrash />
            Delete selected ({selected.size})
          </button>
          <button className="btn btn-ghost" onClick={clearSelection} id="gallery-deselect-all">
            Clear
          </button>
        </div>
      )}
    </>
  );
}

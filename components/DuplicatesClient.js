"use client";

import { useEffect, useState } from "react";
import { addToast, ToastContainer } from "./Toast";
import ConfirmDialog from "./ConfirmDialog";

/* ── helpers ───────────────────────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="dup-group">
          <div className="skeleton skeleton-line" style={{ width: 200, height: 18, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 12 }}>
            {[1, 2].map((j) => (
              <div key={j} className="skeleton" style={{ width: 120, height: 120, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Single photo card inside a duplicate group ────────────────────────────── */
function DupCard({ photo, selected, onToggle, currentUsername }) {
  const isOwner = photo.uploader.username === currentUsername;
  return (
    <div
      className={`dup-card ${selected ? "dup-card-selected" : ""} ${!isOwner ? "dup-card-unowned" : ""}`}
      onClick={() => isOwner && onToggle(photo.id)}
      title={isOwner ? "Click to select for deletion" : "You can only delete your own uploads"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dup-thumb"
        src={`/api/photos/${photo.id}/file?thumb=1`}
        alt={photo.originalName}
      />
      <div className="dup-card-meta">
        <div className="dup-card-uploader">{photo.uploader.username}</div>
        <div className="dup-card-date">{formatDate(photo.createdAt)}</div>
        {photo.category && (
          <div className="dup-card-category">{photo.category.name}</div>
        )}
        {isOwner && (
          <label className="dup-card-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(photo.id)}
            />
            Delete this copy
          </label>
        )}
        {!isOwner && (
          <div className="dup-card-notowned">Not your upload</div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function DuplicatesClient({ currentUsername }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set()); // photo IDs to delete
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/photos/duplicates")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ groups }) => setGroups(groups))
      .catch(() => addToast("Could not load duplicates.", "error"))
      .finally(() => setLoading(false));
  }, []);

  function toggleSelect(id) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  // Pre-select all but the oldest copy in every group (oldest = index 0,
  // since the API returns them oldest-first). Only selects owned items.
  function selectSuggested() {
    const ids = new Set();
    for (const group of groups) {
      group.slice(1).forEach((photo) => {
        if (photo.uploader.username === currentUsername) ids.add(photo.id);
      });
    }
    setSelected(ids);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleDeleteConfirmed() {
    setConfirmOpen(false);
    setDeleting(true);
    const ids = Array.from(selected);
    try {
      const res = await fetch("/api/photos/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || "Delete failed.", "error");
        return;
      }
      const { deletedIds = [], skippedIds = [] } = data;

      // Remove deleted photos from groups, then drop groups with only 1 left
      setGroups((prev) =>
        prev
          .map((g) => g.filter((p) => !deletedIds.includes(p.id)))
          .filter((g) => g.length > 1)
      );
      setSelected((prev) => {
        const s = new Set(prev);
        deletedIds.forEach((id) => s.delete(id));
        return s;
      });

      if (deletedIds.length > 0)
        addToast(`${deletedIds.length} duplicate${deletedIds.length === 1 ? "" : "s"} deleted.`, "success");
      if (skippedIds.length > 0)
        addToast(`${skippedIds.length} item${skippedIds.length === 1 ? " wasn't" : "s weren't"} deleted — you can only delete your own uploads.`, "error");
    } catch {
      addToast("Delete failed.", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <Skeleton />;

  if (groups.length === 0) {
    return (
      <div className="dup-empty">
        <p>🎉 No duplicates found.</p>
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`}
        message="This removes the selected copies for everyone and can't be undone."
        confirmLabel={`Delete ${selected.size}`}
        danger
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Summary + bulk actions */}
      <div className="dup-toolbar">
        <span className="dup-summary">
          {groups.length} duplicate group{groups.length === 1 ? "" : "s"} &mdash;{" "}
          {groups.reduce((n, g) => n + g.length, 0)} files total
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={selectSuggested}>
            Select extras (keep oldest)
          </button>
          {selected.size > 0 && (
            <>
              <button className="btn btn-sm btn-ghost" onClick={clearSelection}>
                Clear
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : `Delete selected (${selected.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Groups */}
      <div className="dup-groups">
        {groups.map((group, gi) => (
          <div key={gi} className="dup-group">
            <div className="dup-group-header">
              <span className="dup-group-name">{group[0].originalName}</span>
              <span className="dup-group-size">{formatBytes(group[0].size)}</span>
              <span className="dup-group-count">{group.length} copies</span>
            </div>
            <div className="dup-cards">
              {group.map((photo, idx) => (
                <DupCard
                  key={photo.id}
                  photo={photo}
                  selected={selected.has(photo.id)}
                  onToggle={toggleSelect}
                  currentUsername={currentUsername}
                  isOldest={idx === 0}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

"use client";

export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel, danger = false }) {
  if (!open) return null;

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel();
  }

  // Close on Escape key
  function handleKeyDown(e) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      className="dialog-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="dialog-box">
        <h2 id="dialog-title">{title}</h2>
        {message && <p>{message}</p>}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            type="button"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

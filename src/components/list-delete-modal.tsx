'use client';

import { useEffect } from 'react';

type ListDeleteModalProps = {
  open: boolean;
  listName: string;
  contactCount: number;
  campaignCount: number;
  busy?: boolean;
  onClose: () => void;
  onDelete: (forceDelete: boolean) => Promise<void> | void;
};

export function ListDeleteModal({
  open,
  listName,
  contactCount,
  campaignCount,
  busy = false,
  onClose,
  onDelete,
}: ListDeleteModalProps) {
  const hasCampaigns = campaignCount > 0;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const title = hasCampaigns ? 'List is still in use' : 'Delete list?';
  const primaryLabel = hasCampaigns ? 'Hard delete list' : 'Delete list';
  const contactLabel = contactCount === 1 ? 'contact' : 'contacts';
  const campaignLabel = campaignCount === 1 ? 'campaign' : 'campaigns';

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-delete-modal-title"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(720px, 100%)' }}
      >
        <div className="campaign-risk-panel__header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2 id="list-delete-modal-title" style={{ marginBottom: '0.35rem' }}>
              {title}
            </h2>
            <p className="form-note" style={{ marginBottom: 0 }}>
              {hasCampaigns
                ? `This list is used by ${campaignCount} ${campaignLabel}. A normal delete is blocked because those campaigns still point at it.`
                : 'This will permanently delete the list and remove every contact in it.'}
            </p>
          </div>
          <button className="mini-btn" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(15, 23, 42, 0.35)' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>What will be removed</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cbd5e1', lineHeight: 1.7 }}>
            <li>The list named <strong>{listName}</strong></li>
            <li>All {contactCount} {contactLabel} in this list</li>
            {hasCampaigns ? <li>{campaignCount} {campaignLabel} that still use this list</li> : null}
            {hasCampaigns ? <li>Those campaigns&apos; queued send jobs and event rows</li> : null}
          </ul>
        </div>

        {hasCampaigns ? (
          <p className="form-note" style={{ marginBottom: '1rem' }}>
            Campaign metrics and system logs may remain for reporting, but the campaigns themselves will be permanently removed.
          </p>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void onDelete(hasCampaigns)}
            disabled={busy}
            style={hasCampaigns ? { background: '#dc2626', boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.35)' } : undefined}
          >
            {busy ? 'Deleting...' : primaryLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

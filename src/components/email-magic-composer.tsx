'use client';

import { useMemo, useState } from 'react';

type ComposerMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type DraftCandidate = {
  reply: string;
  subject: string;
  bodyHtml: string;
};

type Props = {
  surface: 'campaign' | 'template';
  draftName: string;
  subject: string;
  bodyHtml: string;
  linkedTemplateName?: string | null;
  listNames?: string[];
  disabled?: boolean;
  onApply: (next: { subject: string; bodyHtml: string }) => void;
};

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function EmailMagicComposer({
  surface,
  draftName,
  subject,
  bodyHtml,
  linkedTemplateName,
  listNames = [],
  disabled = false,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState<ComposerMessage[]>([]);
  const [candidate, setCandidate] = useState<DraftCandidate | null>(null);

  const hasContext = useMemo(() => {
    const normalizedBody = bodyHtml.replace(/\s+/g, ' ').trim();
    return Boolean(subject.trim()) || normalizedBody.length > 80;
  }, [bodyHtml, subject]);

  async function submitPrompt() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || busy) return;

    setBusy(true);
    setStatus('');

    const userMessage: ComposerMessage = { role: 'user', content: nextPrompt };
    const nextHistory = [...history, userMessage];
    setHistory(nextHistory);

    const response = await fetch('/api/ai/email-compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        surface,
        prompt: nextPrompt,
        subject,
        bodyHtml,
        draftName,
        linkedTemplateName: linkedTemplateName || null,
        listNames,
        history,
      }),
    });

    const data =
      (await readJson<{ error?: string; reply?: string; subject?: string; bodyHtml?: string; model?: string }>(response)) || {};

    setBusy(false);
    if (!response.ok || !data.reply || typeof data.subject !== 'string' || typeof data.bodyHtml !== 'string') {
      setHistory(history);
      setStatus(data.error || 'AI Magic could not build the draft.');
      return;
    }

    const assistantMessage: ComposerMessage = { role: 'assistant', content: data.reply };
    setHistory([...nextHistory, assistantMessage]);
    setPrompt('');
    setCandidate({ reply: data.reply, subject: data.subject, bodyHtml: data.bodyHtml });
    setStatus('AI Magic prepared a new draft. Review it below before applying it.');
  }

  return (
    <div className="email-magic">
      <div className="email-magic__header">
        <div>
          <strong>AI Magic</strong>
          <p>
            Describe the email you want, then keep refining it in the same thread.
          </p>
        </div>
        <button
          type="button"
          className={`mini-btn ${open ? 'active' : ''}`}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Hide AI Magic' : 'Open AI Magic'}
        </button>
      </div>

      {open ? (
        <div className="email-magic__panel">
          <div className="email-magic__context">
            <span>{surface === 'campaign' ? 'Campaign draft' : 'Template draft'}</span>
            {linkedTemplateName ? <span>Template: {linkedTemplateName}</span> : null}
            {listNames.length ? <span>Lists: {listNames.join(', ')}</span> : null}
            <span>{hasContext ? 'Current draft will be refined.' : 'AI will start a fresh draft.'}</span>
          </div>

          <div className="email-magic__messages">
            {history.length ? (
              history.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`email-magic__bubble email-magic__bubble--${message.role}`}>
                  <div className="email-magic__bubble-label">{message.role === 'assistant' ? 'AI Magic' : 'You'}</div>
                  <pre>{message.content}</pre>
                </div>
              ))
            ) : (
              <div className="email-magic__empty">
                Ask for a welcome email, a promo blast, a reminder, a follow-up, or a rewrite with a different tone.
              </div>
            )}
          </div>

          {candidate ? (
            <div className="email-magic__review">
              <div className="email-magic__review-header">
                <div>
                  <strong>Draft preview</strong>
                  <p>Compare your current draft with the latest AI proposal before applying it.</p>
                </div>
                <div className="email-magic__actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      onApply({ subject: candidate.subject, bodyHtml: candidate.bodyHtml });
                      setCandidate(null);
                      setStatus('AI draft applied to the subject and email body.');
                    }}
                    disabled={busy || disabled}
                  >
                    Use this draft
                  </button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      setCandidate(null);
                      setStatus('Kept the current draft.');
                    }}
                    disabled={busy || disabled}
                  >
                    Keep current draft
                  </button>
                </div>
              </div>

              <div className="email-magic__review-grid">
                <section className="email-magic__review-card">
                  <div className="email-magic__review-label">Current</div>
                  <div className="email-magic__review-subject">{subject.trim() || '(No subject yet)'}</div>
                  <iframe
                    title="Current email draft preview"
                    className="email-magic__preview-frame"
                    srcDoc={bodyHtml}
                    sandbox=""
                  />
                </section>
                <section className="email-magic__review-card email-magic__review-card--candidate">
                  <div className="email-magic__review-label">AI draft</div>
                  <div className="email-magic__review-subject">{candidate.subject.trim() || '(No subject returned)'}</div>
                  <iframe
                    title="AI email draft preview"
                    className="email-magic__preview-frame"
                    srcDoc={candidate.bodyHtml}
                    sandbox=""
                  />
                </section>
              </div>
            </div>
          ) : null}

          <div className="email-magic__composer">
            <textarea
              className="auth-textarea"
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Write a friendly launch email for a summer discount campaign with a short subject and one clear call to action."
              disabled={busy || disabled}
            />
            <div className="email-magic__actions">
              <button type="button" className="btn-primary" onClick={submitPrompt} disabled={busy || disabled || !prompt.trim()}>
                {busy ? 'Thinking...' : history.length ? 'Refine with AI' : 'Generate with AI'}
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  setHistory([]);
                  setPrompt('');
                  setStatus('');
                  setCandidate(null);
                }}
                disabled={busy || disabled}
              >
                Clear chat
              </button>
            </div>
            {status ? <p className="form-note">{status}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

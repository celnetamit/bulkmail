'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

type Mode = 'visual' | 'html' | 'preview';

type ToolbarCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'undo'
  | 'redo'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'formatBlock'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'justifyFull'
  | 'insertHorizontalRule'
  | 'removeFormat'
  | 'createLink'
  | 'unlink'
  | 'insertImage'
  | 'fontName'
  | 'fontSize'
  | 'foreColor'
  | 'hiliteColor';

type InsertBlock =
  | 'text'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'twoColumn'
  | 'quote'
  | 'list'
  | 'hero'
  | 'testimonial'
  | 'productCard'
  | 'header'
  | 'footer';

export const starterTemplate = (headline: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 24px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#0f172a;">${headline}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#334155;">
                  Use this editor to work in visual mode or edit the HTML directly. The preview on the right shows the rendered email exactly as it will be sent.
                </p>
                <a href="https://example.com" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;">
                  Call to action
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

function normalizeHtml(value: string, placeholder: string) {
  const trimmed = value.trim();
  return trimmed || starterTemplate(placeholder);
}

function isFullDocument(content: string) {
  const trimmed = content.trim();
  return /^<!doctype\s+html>/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function extractDocumentParts(value: string, fallbackHeadline: string) {
  const html = normalizeHtml(value, fallbackHeadline);

  if (typeof DOMParser === 'undefined' || !isFullDocument(html)) {
    return { headHtml: '', bodyHtml: html };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return {
    headHtml: doc.head.innerHTML || '',
    bodyHtml: doc.body.innerHTML || '',
  };
}

function composeDocument(headHtml: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headHtml ? `\n    ${headHtml.trim().replace(/\n/g, '\n    ')}` : ''}
  </head>
  <body>${bodyHtml}</body>
  </html>`;
}

function execCommand(command: ToolbarCommand, value?: string) {
  document.execCommand(command, false, value);
}

function insertTable(rows = 2, cols = 2) {
  const cells = Array.from({ length: cols }, () => '<td style="border:1px solid #cbd5e1;padding:8px;">Cell</td>').join('');
  const table = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;margin:16px 0;">${Array.from({ length: rows }, () => `<tr>${cells}</tr>`).join('')}</table>`;
  document.execCommand('insertHTML', false, table);
}

function insertBlock(block: InsertBlock) {
  const blocks: Record<InsertBlock, string> = {
    text: `<p style="margin:0 0 16px;line-height:1.7;color:#334155;">Write your paragraph here.</p>`,
    button: `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;"><tr><td><a href="https://example.com" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;">Button</a></td></tr></table>`,
    divider: `<hr style="border:none;border-top:1px solid #cbd5e1;margin:20px 0;" />`,
    spacer: `<div style="height:24px;line-height:24px;font-size:24px;">&nbsp;</div>`,
    twoColumn: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border-collapse:collapse;">
        <tr>
          <td width="50%" style="padding:8px;vertical-align:top;">
            <p style="margin:0;line-height:1.7;color:#334155;">Left column content.</p>
          </td>
          <td width="50%" style="padding:8px;vertical-align:top;">
            <p style="margin:0;line-height:1.7;color:#334155;">Right column content.</p>
          </td>
        </tr>
      </table>`,
    quote: `<blockquote style="margin:16px 0;padding:0 0 0 16px;border-left:4px solid #93c5fd;color:#334155;line-height:1.7;">Quoted text goes here.</blockquote>`,
    list: `<ul style="margin:16px 0;padding-left:20px;color:#334155;line-height:1.7;"><li>First item</li><li>Second item</li><li>Third item</li></ul>`,
    hero: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border-collapse:collapse;background:#eff6ff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#2563eb;">Featured update</p>
            <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#0f172a;">Your big message goes here</h1>
            <p style="margin:0 0 18px;line-height:1.7;color:#334155;">Use this hero section to introduce a launch, offer, or key announcement with a strong headline and supporting copy.</p>
            <a href="https://example.com" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;">Primary CTA</a>
          </td>
        </tr>
      </table>`,
    testimonial: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border-collapse:collapse;background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#334155;">“This is a testimonial quote area. Put a short endorsement or customer note here.”</p>
            <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">Alex Johnson</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Growth Lead, Example Co.</p>
          </td>
        </tr>
      </table>`,
    productCard: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border-collapse:collapse;">
        <tr>
          <td style="padding:0 8px 0 0;vertical-align:top;width:50%;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;">
              <tr><td style="background:#e2e8f0;height:160px;text-align:center;color:#64748b;">Product image</td></tr>
              <tr><td style="padding:16px;"><h3 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Product name</h3><p style="margin:0 0 12px;line-height:1.6;color:#334155;">Short description that helps the reader understand the product quickly.</p><p style="margin:0;font-weight:700;color:#0f172a;">$49</p></td></tr>
            </table>
          </td>
          <td style="padding:0 0 0 8px;vertical-align:top;width:50%;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;">
              <tr><td style="background:#e2e8f0;height:160px;text-align:center;color:#64748b;">Product image</td></tr>
              <tr><td style="padding:16px;"><h3 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Product name</h3><p style="margin:0 0 12px;line-height:1.6;color:#334155;">Short description that helps the reader understand the product quickly.</p><p style="margin:0;font-weight:700;color:#0f172a;">$49</p></td></tr>
            </table>
          </td>
        </tr>
      </table>`,
    header: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="font-size:18px;font-weight:700;color:#0f172a;">MailFlow</td>
                <td align="right" style="font-size:13px;color:#64748b;">View in browser</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`,
    footer: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;border-collapse:collapse;border-top:1px solid #cbd5e1;">
        <tr>
          <td style="padding:16px 0;font-size:12px;line-height:1.7;color:#64748b;">
            You’re receiving this email because you subscribed to updates.<br />
            <a href="https://example.com" style="color:#2563eb;text-decoration:underline;">Unsubscribe</a>
          </td>
        </tr>
      </table>`,
  };

  document.execCommand('insertHTML', false, blocks[block]);
}

function buildPreviewDoc(value: string, placeholder: string) {
  const { headHtml, bodyHtml } = extractDocumentParts(value, placeholder);
  return composeDocument(headHtml, bodyHtml);
}

export function EmailRichEditor({
  value,
  onChange,
  placeholder = 'Write your email content...',
  label = 'Email body',
}: Props) {
  const [mode, setMode] = useState<Mode>('visual');
  const visualRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastAppliedValueRef = useRef<string>('');
  const shellRef = useRef<{ headHtml: string; bodyHtml: string }>({ headHtml: '', bodyHtml: '' });
  const savedSelectionRef = useRef<Range | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [foreColor, setForeColor] = useState('#0f172a');
  const [highlightColor, setHighlightColor] = useState('#ffffff');

  const previewDoc = useMemo(() => buildPreviewDoc(value, placeholder), [placeholder, value]);

  useEffect(() => {
    const parts = extractDocumentParts(value, placeholder);
    shellRef.current = parts;

    if (mode !== 'visual') return;
    const el = visualRef.current;
    if (!el) return;

    if (value !== lastAppliedValueRef.current) {
      el.innerHTML = parts.bodyHtml || '';
      lastAppliedValueRef.current = value;
    }
  }, [mode, placeholder, value]);

  function syncVisualContent() {
    const bodyHtml = visualRef.current?.innerHTML || '';
    const nextValue = composeDocument(shellRef.current.headHtml, bodyHtml);
    lastAppliedValueRef.current = nextValue;
    onChange(nextValue);
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = visualRef.current;
    if (!container) return;

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode || (!container.contains(anchorNode) && !container.contains(focusNode))) return;

    savedSelectionRef.current = range;
  }

  function restoreSelection() {
    const range = savedSelectionRef.current;
    if (!range) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function insertHtml(html: string) {
    document.execCommand('insertHTML', false, html);
  }

  function insertMediaUrl(url: string) {
    const image = `<img src="${url}" alt="" style="display:block;max-width:100%;height:auto;margin:16px 0;" />`;
    insertHtml(image);
  }

  function handleVisualCommand(command: ToolbarCommand, value?: string) {
    const el = visualRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();

    if (command === 'createLink') {
      const url = window.prompt('Enter link URL');
      if (!url) return;
      execCommand(command, url);
      syncVisualContent();
      return;
    }

    if (command === 'insertImage') {
      const url = window.prompt('Enter image URL');
      if (!url) return;
      insertHtml(`<img src="${url}" alt="" style="display:block;max-width:100%;height:auto;margin:16px 0;" />`);
      syncVisualContent();
      return;
    }

    if (command === 'formatBlock' && value) {
      execCommand(command, `<${value}>`);
      syncVisualContent();
      return;
    }

    if (command === 'fontName' && value) {
      execCommand(command, value);
    } else if (command === 'fontSize' && value) {
      execCommand(command, value);
    } else if (command === 'foreColor' && value) {
      execCommand(command, value);
    } else if (command === 'hiliteColor' && value) {
      execCommand(command, value);
    } else {
      if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
        document.execCommand('styleWithCSS', false, 'true');
      }
      if (command === 'removeFormat') {
        document.execCommand('removeFormat', false);
        document.execCommand('unlink', false);
      } else {
        execCommand(command);
      }
    }

    syncVisualContent();
  }

  async function uploadImage(file: File) {
    if (file.size > 50 * 1024) {
      setUploadMessage('Images must be 50 KB or smaller.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadMessage('Only image files are supported here.');
      return;
    }

    setUploadMessage('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads/media', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok) {
        setUploadMessage(data.error || 'Upload failed.');
        return;
      }

      const url = data.url;
      if (!url) {
        setUploadMessage('Upload returned no file URL.');
        return;
      }

      const el = visualRef.current;
      if (el) {
        el.focus();
        restoreSelection();
        insertMediaUrl(url);
        syncVisualContent();
        setUploadMessage('Image uploaded and inserted.');
      }
    } catch {
      setUploadMessage('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  }

  function openMediaLibrary() {
    saveSelection();
    window.open('/dashboard/media-library?pick=1', '_blank', 'width=1024,height=840');
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== 'object') return;
      if ((event.data as { type?: string }).type !== 'mailflow.insert-media') return;

      const url = (event.data as { url?: string }).url;
      if (!url) return;

      const el = visualRef.current;
      if (el) {
        el.focus();
        restoreSelection();
        insertMediaUrl(url);
        syncVisualContent();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="email-editor email-editor--html">
      <div className="email-editor__header">
        <label>{label}</label>
        <span>Visual and HTML editing</span>
      </div>
      <div className="email-editor__mode-switch" role="tablist" aria-label={`${label} editor mode`}>
        <button type="button" className={`mini-btn ${mode === 'visual' ? 'active' : ''}`} onClick={() => setMode('visual')}>
          Visual
        </button>
        <button type="button" className={`mini-btn ${mode === 'html' ? 'active' : ''}`} onClick={() => setMode('html')}>
          HTML
        </button>
        <button type="button" className={`mini-btn ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>
          Preview
        </button>
      </div>

      {mode === 'visual' ? (
        <div className="email-editor__panel">
          <div className="email-editor__panel-header">
            <span>Visual editor</span>
            <span>Click and type in the email canvas. Image uploads follow the configured limit.</span>
          </div>
          <div className="email-editor__toolbar">
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('undo')}>Undo</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('redo')}>Redo</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('bold')}>Bold</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('italic')}>Italic</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('underline')}>Underline</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('formatBlock', 'p')}>P</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('formatBlock', 'h1')}>H1</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('formatBlock', 'h2')}>H2</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('insertUnorderedList')}>Bullets</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('insertOrderedList')}>Numbered</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('justifyLeft')}>Left</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('justifyCenter')}>Center</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('justifyRight')}>Right</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('justifyFull')}>Justify</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('createLink')}>Link</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('unlink')}>Unlink</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('insertHorizontalRule')}>Rule</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('insertImage')}>Image</button>
            <button type="button" className="mini-btn" onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload image'}
            </button>
            <button type="button" className="mini-btn" onClick={openMediaLibrary}>
              Media library
            </button>
            <button type="button" className="mini-btn" onClick={() => insertTable()}>Table</button>
            <button type="button" className="mini-btn" onClick={() => handleVisualCommand('removeFormat')}>Clear</button>
            <select
              className="status-select email-editor__select email-editor__select--wide"
              defaultValue=""
              onChange={(event) => {
                const block = event.target.value as InsertBlock;
                if (!block) return;
                insertBlock(block);
                syncVisualContent();
                event.target.value = '';
              }}
            >
              <option value="">Insert block</option>
              <option value="hero">Hero section</option>
              <option value="header">Header</option>
              <option value="text">Text block</option>
              <option value="button">Button block</option>
              <option value="divider">Divider</option>
              <option value="spacer">Spacer</option>
              <option value="twoColumn">Two columns</option>
              <option value="quote">Quote</option>
              <option value="list">List</option>
              <option value="testimonial">Testimonial</option>
              <option value="productCard">Product cards</option>
              <option value="footer">Footer</option>
            </select>
            <select
              className="status-select email-editor__select"
              value={fontFamily}
              onChange={(event) => {
                setFontFamily(event.target.value);
                handleVisualCommand('fontName', event.target.value);
              }}
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Verdana">Verdana</option>
            </select>
            <select
              className="status-select email-editor__select"
              value={fontSize}
              onChange={(event) => {
                setFontSize(event.target.value);
                handleVisualCommand('fontSize', event.target.value);
              }}
            >
              <option value="1">Tiny</option>
              <option value="2">Small</option>
              <option value="3">Normal</option>
              <option value="4">Medium</option>
              <option value="5">Large</option>
              <option value="6">Huge</option>
            </select>
            <label className="email-editor__color-control">
              Text
              <input
                type="color"
                value={foreColor}
                onChange={(event) => {
                  setForeColor(event.target.value);
                  handleVisualCommand('foreColor', event.target.value);
                }}
              />
            </label>
            <label className="email-editor__color-control">
              Fill
              <input
                type="color"
                value={highlightColor}
                onChange={(event) => {
                  setHighlightColor(event.target.value);
                  handleVisualCommand('hiliteColor', event.target.value);
                }}
              />
            </label>
          </div>
          <div className="email-editor__visual-shell">
            <div className="email-editor__visual-frame">
              <div
                ref={visualRef}
                className="email-editor__visual-surface"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                style={{ fontFamily }}
                onInput={syncVisualContent}
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                onFocus={(event) => {
                  saveSelection();
                  const current = event.currentTarget.innerHTML;
                  if (!current) {
                    const parts = extractDocumentParts(value, placeholder);
                    event.currentTarget.innerHTML = parts.bodyHtml || '';
                  }
                }}
              />
            </div>
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void uploadImage(file);
              }
            }}
          />
          {uploadMessage ? <p className="form-note" style={{ marginTop: '0.75rem' }}>{uploadMessage}</p> : null}
        </div>
      ) : null}

      {mode === 'html' ? (
        <div className="email-editor__panel">
          <div className="email-editor__panel-header">
            <span>HTML</span>
            <span>{placeholder}</span>
          </div>
          <textarea
            className="auth-textarea email-editor__source"
            rows={24}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            placeholder={placeholder}
          />
        </div>
      ) : null}

      {mode === 'preview' ? (
        <div className="email-editor__panel">
          <div className="email-editor__panel-header">
            <span>Preview</span>
            <span>Rendered email body</span>
          </div>
          <iframe
            title={`${label} preview`}
            className="email-editor__preview email-editor__preview--full"
            srcDoc={previewDoc}
            sandbox=""
          />
        </div>
      ) : null}
    </div>
  );
}

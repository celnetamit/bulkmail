'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type AgentKey = 'debugger' | 'support' | 'worker';

type AgentProfile = {
  agentKey: AgentKey;
  label: string;
  description: string;
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  systemPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  isEnabled: boolean;
  source: 'database' | 'env';
};

type ApiResponse = {
  profiles: AgentProfile[];
};

const agentOrder: AgentKey[] = ['debugger', 'support', 'worker'];

function getTitle(agentKey: AgentKey) {
  if (agentKey === 'debugger') return 'Agent 1 - Debugger';
  if (agentKey === 'worker') return 'Agent 3 - Worker';
  return 'Agent 2 - Support';
}

export default function AdminAgentsClient() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<AgentKey, Partial<AgentProfile> & { apiKey: string }>>({
    debugger: { apiKey: '' },
    support: { apiKey: '' },
    worker: { apiKey: '' },
  });

  async function load() {
    const response = await fetch('/api/admin/agents', { cache: 'no-store' });
    const data = (await response.json()) as ApiResponse & { error?: string };
    if (!response.ok) {
      toast.error('AI settings load failed', data.error || 'AI agent settings could not be loaded.');
      return;
    }

    setProfiles(data.profiles || []);
    const nextDrafts: Record<AgentKey, Partial<AgentProfile> & { apiKey: string }> = {
      debugger: { apiKey: '' },
      support: { apiKey: '' },
      worker: { apiKey: '' },
    };

    for (const profile of data.profiles || []) {
      nextDrafts[profile.agentKey] = {
        label: profile.label,
        description: profile.description,
        provider: profile.provider,
        model: profile.model,
        baseUrl: profile.baseUrl,
        apiKey: '',
        systemPrompt: profile.systemPrompt,
        temperature: profile.temperature,
        maxOutputTokens: profile.maxOutputTokens,
        isEnabled: profile.isEnabled,
      };
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    load();
  }, []);

  function updateDraft(agentKey: AgentKey, field: string, value: string | number | boolean) {
    setDrafts((current) => ({
      ...current,
      [agentKey]: {
        ...current[agentKey],
        [field]: value,
      },
    }));
  }

  async function save() {
    setSaving(true);
    const payload = {
      profiles: agentOrder.map((agentKey) => ({
        agentKey,
        label: drafts[agentKey].label,
        description: drafts[agentKey].description,
        provider: drafts[agentKey].provider,
        model: drafts[agentKey].model,
        baseUrl: drafts[agentKey].baseUrl,
        apiKey: drafts[agentKey].apiKey,
        systemPrompt: drafts[agentKey].systemPrompt,
        temperature: drafts[agentKey].temperature,
        maxOutputTokens: drafts[agentKey].maxOutputTokens,
        isEnabled: drafts[agentKey].isEnabled,
      })),
    };

    const response = await fetch('/api/admin/agents', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as ApiResponse & { error?: string };
    setSaving(false);
    if (!response.ok) {
      toast.error('AI settings save failed', data.error || 'AI agent settings could not be saved.');
      return;
    }

    setProfiles(data.profiles || []);
    toast.success('AI settings saved', 'All AI agent profiles were updated.');
    await load();
  }

  const grouped = useMemo(
    () => agentOrder.map((agentKey) => ({
      agentKey,
      profile: profiles.find((profile) => profile.agentKey === agentKey),
      draft: drafts[agentKey],
    })),
    [profiles, drafts],
  );

  return (
    <div className="overview">
      <header className="page-header page-header__row">
        <div>
          <h1>AI Agents</h1>
          <p>Configure the provider, model, prompt, and key for each agent role.</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving' : 'Save All'}
          </button>
        </div>
      </header>
      <div className="cards-grid">
        {grouped.map(({ agentKey, profile, draft }) => (
          <section key={agentKey} className="card ai-agent-card">
            <div className="section-header section-header--compact">
              <div>
                <h2>{getTitle(agentKey)}</h2>
                <p>{profile?.description || 'Edit the agent settings below.'}</p>
              </div>
              <span className={`pill ${profile?.isEnabled ? 'pill--success' : 'pill--muted'}`}>
                {profile?.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="ai-agent-grid">
              <label>
                Label
                <input value={String(draft?.label || '')} onChange={(e) => updateDraft(agentKey, 'label', e.target.value)} />
              </label>
              <label>
                Provider
                <select className="status-select" value={String(draft?.provider || 'openrouter')} onChange={(e) => updateDraft(agentKey, 'provider', e.target.value)}>
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI Compatible</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              <label>
                Model
                <input value={String(draft?.model || '')} onChange={(e) => updateDraft(agentKey, 'model', e.target.value)} />
              </label>
              <label>
                Base URL
                <input value={String(draft?.baseUrl || '')} onChange={(e) => updateDraft(agentKey, 'baseUrl', e.target.value)} placeholder="Defaults from provider" />
              </label>
              <label>
                API Key
                <input value={draft?.apiKey || ''} onChange={(e) => updateDraft(agentKey, 'apiKey', e.target.value)} placeholder={profile?.hasApiKey ? 'Leave blank to keep existing key' : 'Enter API key'} />
              </label>
              <label>
                Temperature
                <input type="number" step="0.1" min="0" max="2" value={String(draft?.temperature ?? 0.4)} onChange={(e) => updateDraft(agentKey, 'temperature', Number(e.target.value))} />
              </label>
              <label>
                Max output tokens
                <input type="number" step="1" min="64" value={String(draft?.maxOutputTokens ?? 1200)} onChange={(e) => updateDraft(agentKey, 'maxOutputTokens', Number(e.target.value))} />
              </label>
              <label>
                Active
                <input type="checkbox" checked={Boolean(draft?.isEnabled ?? true)} onChange={(e) => updateDraft(agentKey, 'isEnabled', e.target.checked)} />
              </label>
            </div>

            <label className="ai-agent-prompt">
              System prompt
              <textarea rows={10} value={String(draft?.systemPrompt || '')} onChange={(e) => updateDraft(agentKey, 'systemPrompt', e.target.value)} />
            </label>

            <div className="ai-agent-meta">
              <span>Source: {profile?.source || 'env'}</span>
              <span>Has key: {profile?.hasApiKey ? 'yes' : 'no'}</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

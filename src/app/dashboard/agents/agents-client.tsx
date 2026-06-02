'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AgentKey = 'debugger' | 'support' | 'worker';

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AgentConversation = {
  id: string;
  agentKey: AgentKey;
  title: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
};

type AgentThreadResponse = {
  conversations: Array<{
    id: string;
    agentKey: AgentKey;
    title: string | null;
    userId: string;
    lastMessageAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activeConversation: AgentConversation | null;
};

type ChatResponse = {
  conversation: AgentConversation;
  reply: string;
  actions: Array<{ type: string; [key: string]: unknown }>;
  executed?: Array<{ type: string; result: string }>;
};

const AGENT_META: Record<AgentKey, { label: string; description: string; adminOnly?: boolean }> = {
  debugger: {
    label: 'Debugger',
    description: 'Platform error reports, failures, and resource spikes.',
    adminOnly: true,
  },
  support: {
    label: 'Support',
    description: 'Step-by-step help for users.',
  },
  worker: {
    label: 'Worker',
    description: 'Create and edit lists, templates, campaigns, and contacts.',
  },
};

function allowedAgents(role: string) {
  return (Object.keys(AGENT_META) as AgentKey[]).filter((agentKey) => !AGENT_META[agentKey].adminOnly || role === 'ADMIN');
}

function formatTimestamp(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function AgentsClient({ role }: { role: string }) {
  const router = useRouter();
  const [agentKey, setAgentKey] = useState<AgentKey>('support');
  const [threads, setThreads] = useState<AgentThreadResponse['conversations']>([]);
  const [activeConversation, setActiveConversation] = useState<AgentConversation | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingExecution, setPendingExecution] = useState(false);
  const allowed = useMemo(() => allowedAgents(role), [role]);

  async function load(nextAgentKey: AgentKey = agentKey, conversationId?: string) {
    const params = new URLSearchParams();
    params.set('agentKey', nextAgentKey);
    if (conversationId) params.set('conversationId', conversationId);
    const response = await fetch(`/api/agents/conversations?${params.toString()}`, { cache: 'no-store' });
    const data = (await response.json()) as AgentThreadResponse & { error?: string };
    if (!response.ok) {
      setStatus(data.error || 'Failed to load agent conversations.');
      return;
    }

    setThreads(data.conversations || []);
    setActiveConversation(data.activeConversation);
  }

  useEffect(() => {
    if (!allowed.includes(agentKey)) {
      setAgentKey(allowed[0] || 'support');
      return;
    }
    load(agentKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey, role]);

  async function submit() {
    if (!message.trim()) return;
    setSending(true);
    setStatus('');

    const response = await fetch('/api/agents/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentKey,
        message,
        conversationId: activeConversation?.id || undefined,
        executeActions: false,
      }),
    });

    const data = (await response.json()) as ChatResponse & { error?: string };
    setSending(false);
    if (!response.ok) {
      setStatus(data.error || 'Agent request failed.');
      return;
    }

    setMessage('');
    setActiveConversation(data.conversation);
    setThreads((current) => {
      const filtered = current.filter((thread) => thread.id !== data.conversation.id);
      return [{ id: data.conversation.id, agentKey: data.conversation.agentKey, title: data.conversation.title, userId: '', lastMessageAt: data.conversation.lastMessageAt, createdAt: data.conversation.createdAt, updatedAt: data.conversation.updatedAt }, ...filtered];
    });
    setPendingExecution(data.actions.length > 0 && agentKey === 'worker');
    setStatus(data.actions.length > 0 ? 'Worker action plan ready. Review it, then execute if it looks right.' : data.reply);
  }

  async function executePlan() {
    if (!activeConversation) return;
    setSending(true);
    setStatus('');

    const response = await fetch('/api/agents/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentKey: 'worker',
        conversationId: activeConversation.id,
        message: '__EXECUTE__',
        executeActions: true,
      }),
    });

    const data = (await response.json()) as ChatResponse & { error?: string };
    setSending(false);
    if (!response.ok) {
      setStatus(data.error || 'Failed to execute the plan.');
      return;
    }

    setActiveConversation(data.conversation);
    setPendingExecution(false);
    setStatus(data.reply);
  }

  function newThread() {
    setActiveConversation(null);
    setThreads([]);
    setMessage('');
    setPendingExecution(false);
    load(agentKey, undefined);
  }

  const visibleMessages = activeConversation?.messages || [];

  return (
    <div className="overview agents-layout">
      <header className="page-header page-header__row">
        <div>
          <h1>Agents</h1>
          <p>Support, worker, and debugging agents that can guide users and execute approved actions.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" type="button" onClick={newThread}>New Thread</button>
          <button className="btn-secondary" type="button" onClick={() => router.push('/dashboard/help')}>Help</button>
        </div>
      </header>

      <div className="agent-tabs">
        {allowed.map((key) => (
          <button
            key={key}
            type="button"
            className={`agent-tab ${agentKey === key ? 'agent-tab--active' : ''}`}
            onClick={() => setAgentKey(key)}
          >
            <strong>{AGENT_META[key].label}</strong>
            <span>{AGENT_META[key].description}</span>
          </button>
        ))}
      </div>

      <div className="agents-shell">
        <aside className="agent-thread-list card">
          <div className="section-header section-header--compact">
            <div>
              <h2>Threads</h2>
              <p>Recent chats for this agent.</p>
            </div>
          </div>
          <div className="thread-list">
            {threads.length ? threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`thread-list__item ${activeConversation?.id === thread.id ? 'thread-list__item--active' : ''}`}
                onClick={() => load(agentKey, thread.id)}
              >
                <strong>{thread.title || 'Conversation'}</strong>
                <span>{formatTimestamp(thread.lastMessageAt || thread.updatedAt)}</span>
              </button>
            )) : <div className="thread-empty">No threads yet.</div>}
          </div>
        </aside>

        <section className="agent-chat card">
          <div className="section-header section-header--compact">
            <div>
              <h2>{AGENT_META[agentKey].label}</h2>
              <p>{AGENT_META[agentKey].description}</p>
            </div>
            {pendingExecution && agentKey === 'worker' ? <span className="pill pill--warning">Plan ready</span> : null}
          </div>

          <div className="chat-messages">
            {visibleMessages.length ? visibleMessages.map((entry) => (
              <article key={entry.id} className={`chat-bubble chat-bubble--${entry.role}`}>
                <div className="chat-bubble__meta">
                  <strong>{entry.role}</strong>
                  <span>{formatTimestamp(entry.createdAt)}</span>
                </div>
                <pre>{entry.content}</pre>
              </article>
            )) : <div className="chat-empty">Start a conversation with the selected agent.</div>}
          </div>

          <form
            className="agent-compose"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={agentKey === 'worker' ? 'Ask the worker agent to create, edit, or send something...' : 'Ask a question...'}
            />
            <div className="agent-compose__actions">
              <div className="form-note">{status}</div>
              <div className="agent-compose__buttons">
                <button className="btn-secondary" type="button" onClick={() => setMessage('')}>Clear</button>
                {agentKey === 'worker' && pendingExecution ? (
                  <button className="btn-primary" type="button" onClick={executePlan} disabled={sending}>
                    {sending ? 'Executing' : 'Execute plan'}
                  </button>
                ) : (
                  <button className="btn-primary" type="submit" disabled={sending}>
                    {sending ? 'Sending' : 'Send'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

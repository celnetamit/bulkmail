import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import {
  getAgentConversation,
  listAgentConversations,
  runAgentChat,
  ensureAiAgentsSchema,
  type AgentRole,
} from '@/lib/ai-agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseAgentKey(value: string | null) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'debugger' || key === 'support' || key === 'worker') return key;
  return null;
}

export async function GET(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  ensureAiAgentsSchema();

  const { searchParams } = new URL(request.url);
  const agentKey = parseAgentKey(searchParams.get('agentKey')) || 'support';
  const conversationId = searchParams.get('conversationId')?.trim() || null;

  const conversations = await listAgentConversations(auth.user.userId, agentKey);
  const activeConversation = conversationId
    ? await getAgentConversation(conversationId, auth.user.userId)
    : conversations[0]
      ? await getAgentConversation(conversations[0].id, auth.user.userId)
      : null;

  return ok({ conversations, activeConversation });
}

export async function POST(request: Request) {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const agentKey = parseAgentKey((body as Record<string, unknown> | null)?.agentKey ? String((body as Record<string, unknown>).agentKey) : null);
  const message = typeof body === 'object' && body && 'message' in body ? String((body as Record<string, unknown>).message || '').trim() : '';
  const conversationId = typeof body === 'object' && body && 'conversationId' in body ? String((body as Record<string, unknown>).conversationId || '').trim() : undefined;
  const executeActions = typeof body === 'object' && body && 'executeActions' in body ? Boolean((body as Record<string, unknown>).executeActions) : false;

  if (!agentKey) return fail('agentKey is required.', 400);
  if (!message) return fail('message is required.', 400);

  try {
    const agentUser = {
      userId: auth.user.userId,
      email: auth.user.email,
      role: auth.user.role as AgentRole,
    };
    return ok(await runAgentChat(agentUser, { agentKey, message, conversationId, executeActions }));
  } catch (error) {
    console.error('agent_chat_failed', { agentKey, userId: auth.user.userId, error: error instanceof Error ? error.message : String(error) });
    return fail(error instanceof Error ? error.message : 'Agent request failed.', 500);
  }
}

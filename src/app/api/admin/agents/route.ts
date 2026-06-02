import { requireAdminFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { ensureAiAgentsSchema, getAiAgentProfiles, saveAiAgentProfiles } from '@/lib/ai-agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  ensureAiAgentsSchema();
  const profiles = await getAiAgentProfiles();
  return ok({ profiles });
}

export async function PUT(request: Request) {
  const auth = await requireAdminFromCookies();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const profilesInput = Array.isArray((body as { profiles?: unknown[] } | null)?.profiles)
    ? (body as { profiles: unknown[] }).profiles
    : [];

  if (!profilesInput.length) return fail('profiles is required.', 400);

  const profiles = profilesInput.map((profile) => ({
    agentKey: String((profile as Record<string, unknown>).agentKey || '').trim().toLowerCase(),
    label: String((profile as Record<string, unknown>).label || '').trim(),
    description: 'description' in (profile as Record<string, unknown>) ? String((profile as Record<string, unknown>).description || '').trim() : undefined,
    provider: String((profile as Record<string, unknown>).provider || '').trim(),
    model: String((profile as Record<string, unknown>).model || '').trim(),
    baseUrl: String((profile as Record<string, unknown>).baseUrl || '').trim(),
    apiKey: 'apiKey' in (profile as Record<string, unknown>) ? String((profile as Record<string, unknown>).apiKey || '').trim() : undefined,
    systemPrompt: String((profile as Record<string, unknown>).systemPrompt || '').trim(),
    temperature: Number((profile as Record<string, unknown>).temperature),
    maxOutputTokens: Number((profile as Record<string, unknown>).maxOutputTokens),
    isEnabled: Boolean((profile as Record<string, unknown>).isEnabled),
  })).filter((profile) => ['debugger', 'support', 'worker'].includes(profile.agentKey));

  if (!profiles.length) return fail('No valid agent profiles provided.', 400);

  await saveAiAgentProfiles(profiles as Array<{
    agentKey: 'debugger' | 'support' | 'worker';
    label?: string;
    description?: string | null;
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string | null;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    isEnabled?: boolean;
  }>);

  const nextProfiles = await getAiAgentProfiles();
  return ok({ profiles: nextProfiles });
}

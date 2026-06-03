import { requireUserFromRequest } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { AgentRole, runEmailComposer } from '@/lib/ai-agents';

type EmailComposerRequestBody = {
  surface?: 'campaign' | 'template';
  prompt?: string;
  subject?: string;
  bodyHtml?: string;
  draftName?: string;
  linkedTemplateName?: string | null;
  listNames?: string[];
  history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
};

export async function POST(request: Request) {
  const auth = await requireUserFromRequest(request);
  if ('error' in auth) return auth.error;

  let body: EmailComposerRequestBody;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const surface = body.surface === 'campaign' ? 'campaign' : body.surface === 'template' ? 'template' : null;
  const prompt = String(body.prompt || '').trim();

  if (!surface) return fail('Surface is required.', 400);
  if (!prompt) return fail('Prompt is required.', 400);

  try {
    const result = await runEmailComposer(
      {
        userId: auth.user.userId,
        email: auth.user.email,
        role: auth.user.role as AgentRole,
      },
      {
        surface,
        prompt,
        subject: String(body.subject || ''),
        bodyHtml: String(body.bodyHtml || ''),
        draftName: String(body.draftName || ''),
        linkedTemplateName: body.linkedTemplateName ? String(body.linkedTemplateName) : null,
        listNames: Array.isArray(body.listNames) ? body.listNames.map((name) => String(name || '').trim()).filter(Boolean) : [],
        history: Array.isArray(body.history)
          ? body.history
              .map((entry) => ({
                role: (entry.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
                content: String(entry.content || '').trim(),
              }))
              .filter((entry) => entry.content)
          : [],
      },
    );

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to generate email draft.', 500);
  }
}

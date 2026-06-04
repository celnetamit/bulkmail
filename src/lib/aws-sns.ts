import { createVerify } from 'node:crypto';

const certCache = new Map<string, string>();

type SnsEnvelope = {
  Type?: string;
  MessageId?: string;
  Token?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SubscribeURL?: string;
};

export type VerifiedSnsMessage = {
  type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  topicArn: string;
  messageId: string;
  timestamp: string;
  subject: string | null;
  message: string;
  subscribeUrl: string | null;
  token: string | null;
  raw: SnsEnvelope;
};

function normalizeTopicAllowlist() {
  return String(process.env.AWS_SNS_TOPIC_ARN_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedTopic(topicArn: string) {
  const allowlist = normalizeTopicAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(topicArn);
}

function validateCertUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid SNS signing certificate URL.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname || '';

  const validHost =
    /^sns\.[a-z0-9-]+\.amazonaws\.com$/i.test(hostname) ||
    /^sns\.[a-z0-9-]+\.amazonaws\.com\.cn$/i.test(hostname);
  const validPath = /^\/SimpleNotificationService-[A-Fa-f0-9]+\.pem$/.test(pathname);

  if (parsed.protocol !== 'https:' || !validHost || !validPath) {
    throw new Error('SNS signing certificate URL is not trusted.');
  }

  return parsed.toString();
}

async function fetchCertificate(certUrl: string) {
  const trustedUrl = validateCertUrl(certUrl);
  const cached = certCache.get(trustedUrl);
  if (cached) return cached;

  const response = await fetch(trustedUrl, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load SNS signing certificate (${response.status}).`);
  }

  const pem = await response.text();
  certCache.set(trustedUrl, pem);
  return pem;
}

function appendCanonicalValue(lines: string[], key: string, value: string | undefined) {
  if (typeof value === 'string' && value.length > 0) {
    lines.push(key, value);
  }
}

function buildCanonicalMessage(payload: SnsEnvelope) {
  const type = String(payload.Type || '').trim();
  const lines: string[] = [];

  appendCanonicalValue(lines, 'Message', payload.Message);
  appendCanonicalValue(lines, 'MessageId', payload.MessageId);

  if (type === 'Notification') {
    appendCanonicalValue(lines, 'Subject', payload.Subject);
    appendCanonicalValue(lines, 'Timestamp', payload.Timestamp);
    appendCanonicalValue(lines, 'TopicArn', payload.TopicArn);
    appendCanonicalValue(lines, 'Type', payload.Type);
    return lines.join('\n') + '\n';
  }

  appendCanonicalValue(lines, 'SubscribeURL', payload.SubscribeURL);
  appendCanonicalValue(lines, 'Timestamp', payload.Timestamp);
  appendCanonicalValue(lines, 'Token', payload.Token);
  appendCanonicalValue(lines, 'TopicArn', payload.TopicArn);
  appendCanonicalValue(lines, 'Type', payload.Type);
  return lines.join('\n') + '\n';
}

function normalizeEnvelope(raw: unknown): SnsEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as SnsEnvelope;
}

export function looksLikeSnsEnvelope(raw: unknown) {
  const payload = normalizeEnvelope(raw);
  if (!payload) return false;
  const type = String(payload.Type || '').trim();
  return type === 'Notification' || type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation';
}

export async function verifyAndParseSnsMessage(raw: unknown): Promise<VerifiedSnsMessage> {
  const payload = normalizeEnvelope(raw);
  if (!payload) {
    throw new Error('SNS payload must be an object.');
  }

  const type = String(payload.Type || '').trim();
  if (type !== 'Notification' && type !== 'SubscriptionConfirmation' && type !== 'UnsubscribeConfirmation') {
    throw new Error('Unsupported SNS message type.');
  }

  const topicArn = String(payload.TopicArn || '').trim();
  const messageId = String(payload.MessageId || '').trim();
  const message = String(payload.Message || '');
  const timestamp = String(payload.Timestamp || '').trim();
  const signature = String(payload.Signature || '').trim();
  const signatureVersion = String(payload.SignatureVersion || '1').trim();
  const signingCertUrl = String(payload.SigningCertURL || '').trim();

  if (!topicArn || !messageId || !message || !timestamp || !signature || !signingCertUrl) {
    throw new Error('SNS payload is missing required fields.');
  }

  if (!isAllowedTopic(topicArn)) {
    throw new Error('SNS topic is not allowed.');
  }

  const certificate = await fetchCertificate(signingCertUrl);
  const verifier = createVerify(signatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
  verifier.update(buildCanonicalMessage(payload), 'utf8');
  const valid = verifier.verify(certificate, Buffer.from(signature, 'base64'));

  if (!valid) {
    throw new Error('SNS signature verification failed.');
  }

  return {
    type,
    topicArn,
    messageId,
    timestamp,
    subject: payload.Subject ? String(payload.Subject) : null,
    message,
    subscribeUrl: payload.SubscribeURL ? String(payload.SubscribeURL) : null,
    token: payload.Token ? String(payload.Token) : null,
    raw: payload,
  };
}

export async function confirmSnsSubscription(subscribeUrl: string) {
  const parsed = new URL(subscribeUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    !(
      /^sns\.[a-z0-9-]+\.amazonaws\.com$/i.test(hostname) ||
      /^sns\.[a-z0-9-]+\.amazonaws\.com\.cn$/i.test(hostname)
    )
  ) {
    throw new Error('SNS SubscribeURL is not trusted.');
  }

  const response = await fetch(parsed.toString(), { method: 'GET' });
  if (!response.ok) {
    throw new Error(`SNS subscription confirmation failed (${response.status}).`);
  }

  return response.text();
}

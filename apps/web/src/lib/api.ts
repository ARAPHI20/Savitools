const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface WebhookTemplate {
  provider: 'crowdpay' | 'fluxa';
  eventType: string;
  description: string;
  schema: Record<string, string>;
  samplePayload: Record<string, unknown>;
}

export interface WebhookHistoryEntry {
  id: string;
  timestamp: number;
  endpointUrl: string;
  eventType: string;
  method: string;
  requestHeaders: Record<string, string>;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string;
  latencyMs: number;
  error?: string;
  repeatIndex?: number;
}

export async function fetchWebhookTemplates(): Promise<WebhookTemplate[]> {
  const res = await fetch(`${API_URL}/webhook/templates`);
  if (!res.ok) throw new Error('Failed to fetch webhook templates');
  return res.json();
}

export async function saveWebhookTemplate(template: WebhookTemplate): Promise<WebhookTemplate> {
  const res = await fetch(`${API_URL}/webhook/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error('Failed to save webhook template');
  return res.json();
}

export async function sendWebhook(data: {
  endpointUrl: string;
  eventType: string;
  payload?: Record<string, unknown>;
  secret?: string;
  method?: string;
  headers?: Record<string, string>;
  repeatCount?: number;
  repeatIntervalMs?: number;
}): Promise<WebhookHistoryEntry | WebhookHistoryEntry[]> {
  const res = await fetch(`${API_URL}/webhook/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to send webhook');
  }
  return res.json();
}

export async function fetchWebhookHistory(): Promise<WebhookHistoryEntry[]> {
  const res = await fetch(`${API_URL}/webhook/history`);
  if (!res.ok) throw new Error('Failed to fetch webhook history');
  return res.json();
}

export async function replayWebhook(id: string): Promise<WebhookHistoryEntry> {
  const res = await fetch(`${API_URL}/webhook/replay/${id}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to replay webhook');
  return res.json();
}

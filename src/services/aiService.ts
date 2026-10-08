// All network AI calls go through the Vercel proxy — API keys never live in
// the app bundle. Every call has a timeout; failures return a typed reason and
// the caller degrades gracefully. The server enforces usage limits (429).

import { apiUrl, hasApi } from '../config';
import { isCategoryKey } from '../types';
import type { Classification } from '../types';
import { getDeviceId } from './device';

const TIMEOUT_MS = 12_000;

async function postJson(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const deviceId = await getDeviceId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-pea-device': deviceId },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// One retry on network errors and 5xx only — never on 4xx (incl. rate limits).
async function postJsonWithRetry(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Response | null> {
  try {
    const res = await postJson(url, body, timeoutMs);
    if (res.ok || res.status < 500) return res;
  } catch {
    // fall through to retry
  }
  try {
    return await postJson(url, body, timeoutMs);
  } catch {
    return null;
  }
}

export async function classifyRemote(text: string): Promise<Classification | null> {
  if (!hasApi()) return null;
  const res = await postJsonWithRetry(apiUrl('/api/classify'), { text });
  if (!res?.ok) return null;
  try {
    const data = await res.json();
    if (isCategoryKey(data?.category) && typeof data?.cleaned === 'string' && data.cleaned.trim()) {
      return { category: data.category, cleaned: data.cleaned.trim() };
    }
  } catch {}
  return null;
}

export type DraftResult =
  | { ok: true; draft: string }
  | { ok: false; reason: 'no-api' | 'limit' | 'failed' };

export async function generateDraft(itemText: string): Promise<DraftResult> {
  if (!hasApi()) return { ok: false, reason: 'no-api' };
  const res = await postJsonWithRetry(apiUrl('/api/classify'), { text: itemText, mode: 'draft' });
  if (!res) return { ok: false, reason: 'failed' };
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  try {
    const data = await res.json();
    const draft = typeof data?.draft === 'string' ? data.draft.trim() : '';
    return draft ? { ok: true, draft } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no-api' | 'limit' | 'failed' | 'empty' };

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<TranscribeResult> {
  if (!hasApi()) return { ok: false, reason: 'no-api' };
  // Audio uploads are larger — allow a longer window, no retry (recordings are one-shot).
  let res: Response;
  try {
    res = await postJson(apiUrl('/api/transcribe'), { audioBase64, mimeType }, 30_000);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  try {
    const data = await res.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text ? { ok: true, text } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

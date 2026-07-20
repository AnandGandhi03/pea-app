// All network AI calls go through the Vercel proxy — API keys never live in
// the app bundle. Every call has a timeout and a single retry; failures
// return null and the caller degrades gracefully.

import { apiUrl, hasApi } from '../config';
import { isCategoryKey } from '../types';
import type { Classification } from '../types';

const TIMEOUT_MS = 12_000;

async function postJson(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

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

export async function classifyRemote(text: string, userName: string): Promise<Classification | null> {
  if (!hasApi()) return null;
  const res = await postJsonWithRetry(apiUrl('/api/classify'), { text, userName });
  if (!res?.ok) return null;
  try {
    const data = await res.json();
    if (isCategoryKey(data?.category) && typeof data?.cleaned === 'string' && data.cleaned.trim()) {
      return { category: data.category, cleaned: data.cleaned.trim() };
    }
  } catch {}
  return null;
}

export async function generateDraft(itemText: string, userName: string): Promise<string | null> {
  if (!hasApi()) return null;
  const res = await postJsonWithRetry(apiUrl('/api/classify'), { text: itemText, userName, mode: 'draft' });
  if (!res?.ok) return null;
  try {
    const data = await res.json();
    return typeof data?.draft === 'string' && data.draft.trim() ? data.draft.trim() : null;
  } catch {
    return null;
  }
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no-api' | 'failed' | 'empty' };

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<TranscribeResult> {
  if (!hasApi()) return { ok: false, reason: 'no-api' };
  // Audio uploads are larger — allow a longer window, no retry (recordings are one-shot).
  let res: Response;
  try {
    res = await postJson(apiUrl('/api/transcribe'), { audioBase64, mimeType }, 30_000);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (!res.ok) return { ok: false, reason: 'failed' };
  try {
    const data = await res.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text ? { ok: true, text } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

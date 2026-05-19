// src/core/stt/with-timeout.ts

/** Upper bound for a single cloud STT request. Recording is capped at
 *  maxListenMs (default 30s), so the largest legitimate payload is ~30s of
 *  audio; 30s comfortably covers the slowest provider (OpenAI/Gemini on a
 *  full clip under load + slow upload) without false-aborting a valid slow
 *  request. A true hang is the user's escape hatch's job (orb-click cancel),
 *  not a tighter timeout. */
export const STT_TIMEOUT_MS = 30_000;

/** Wrap a fetch in an AbortController timeout so a hung STT request rejects
 *  (→ pipeline catch → FAIL → auto-RESET → idle) instead of stalling the
 *  state machine in 'transcribing' forever. Mirrors the AbortController
 *  pattern already used in core/polish/polish.ts. */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number = STT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

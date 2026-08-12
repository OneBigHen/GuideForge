const companionBase =
  (import.meta.env.VITE_COMPANION_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export async function companionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${companionBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Companion request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

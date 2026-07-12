import type { ApiErrorPayload } from '@cat-diary/domain';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorPayload,
  ) {
    super(payload.message);
  }
}

export function createApiClient(baseUrl: string, getAccessToken?: () => Promise<string | null>) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getAccessToken?.();
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, (await response.json()) as ApiErrorPayload);
    }
    return response.json() as Promise<T>;
  };
}

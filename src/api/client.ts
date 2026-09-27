import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const TOKEN_KEY = 'fim_access_token';

if (!API_BASE_URL) {
  // Fail loudly at build/start time rather than every request silently
  // hitting `undefined/auth/login`.
  console.warn(
    'EXPO_PUBLIC_API_BASE_URL is not set — set it in your .env (see mobile/README.md). ' +
    'Falling back to http://localhost:4000 for now.'
  );
}
const BASE_URL = API_BASE_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip attaching the Authorization header (login/signup only). */
  skipAuth?: boolean;
}

/**
 * Every screen calls through this — never `fetch` directly — so auth
 * headers, base URL, and error shape stay consistent everywhere.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!options.skipAuth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // 204 No Content has no body to parse.
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export { BASE_URL };

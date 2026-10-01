import * as SecureStore from 'expo-secure-store';
import { demoRequest } from './demo';

const TOKEN_KEY = 'fim_access_token';
const URL_KEY = 'fim_api_url';
// Ships pointed at the real hosted backend so the app works out of the box with
// no manual setup. Server Settings (Login/Signup/Settings) can still override this
// at runtime, e.g. for local development against a machine on the same network.
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://fim-api-rtze.onrender.com';

let demoMode = false;
export const isDemoMode = () => demoMode;
export const setDemoMode = (v: boolean) => { demoMode = v; };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Server URL can be changed in-app (Login → Server settings) so no rebuild is needed to point at a backend. */
export async function getBaseUrl(): Promise<string> {
  const saved = await SecureStore.getItemAsync(URL_KEY);
  return (saved || DEFAULT_URL).replace(/\/+$/, '');
}
export async function setBaseUrl(url: string | null): Promise<void> {
  if (url && url.trim()) await SecureStore.setItemAsync(URL_KEY, url.trim());
  else await SecureStore.deleteItemAsync(URL_KEY);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
}

// Render's free tier puts the server to sleep after inactivity; waking it up can take
// 30-50+ seconds. Without a timeout, a request made while it's asleep can hang indefinitely —
// React Native's fetch has no built-in limit — which leaves any "busy" UI state stuck forever
// (buttons disabled, spinners spinning) with no error ever surfacing. 75s comfortably covers a
// cold start while still failing, visibly, if something is actually wrong.
const REQUEST_TIMEOUT_MS = 75000;

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (demoMode) return (await demoRequest(path, options.method || 'GET', options.body)) as T;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.skipAuth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const base = await getBaseUrl();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError("The server is taking a while to respond — it may be waking up after being idle. Please try again.", 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');

export async function checkApi({ signal }: { signal?: AbortSignal } = {}) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env first.');
  const response = await fetch(`${apiUrl}/api/v1/health`, { signal });
  if (!response.ok) throw new Error(`API returned ${response.status}.`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
    throw new Error('Unexpected health response. Check the API URL.');
  }
  return 'API connected';
}

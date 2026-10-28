const productionOrigin = 'https://helpdesk.kmbcloud.at';

export function apiOrigin(env: { EXPO_PUBLIC_API_ORIGIN?: string }): string {
  const value = env.EXPO_PUBLIC_API_ORIGIN?.trim() ?? '';
  if (value === '') return productionOrigin;
  const url = new URL(value);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) {
    return url.origin;
  }
  throw new Error('api origin must be https');
}

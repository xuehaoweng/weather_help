export const APP_URL: string = 'https://43.129.249.56/';

export function isTrustedAppUrl(url: string): boolean {
  return url === APP_URL || url.startsWith(APP_URL);
}

export function isExternalHttpsUrl(url: string): boolean {
  return url.startsWith('https://') && !isTrustedAppUrl(url);
}

import type { ProviderConfig } from '@/lib/shared/types';

const FORBIDDEN_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'host',
  'origin',
  'referer',
  'content-length',
  'connection'
]);

function isPrivateIpv4(hostname: string): boolean {
  if (/^127\./.test(hostname)) {
    return true;
  }
  if (/^10\./.test(hostname)) {
    return true;
  }
  if (/^192\.168\./.test(hostname)) {
    return true;
  }
  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) {
    return false;
  }
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized.endsWith('.local')
    || isPrivateIpv4(normalized)
  );
}

export function assertSafeProviderConfig(provider: ProviderConfig): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(provider.baseUrl);
  } catch {
    throw new Error('Provider Base URL 不是合法 URL。');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Provider URL 不允许包含用户名或密码。');
  }

  if (parsedUrl.protocol !== 'https:' && !provider.allowInsecureTransport) {
    throw new Error('只允许使用 HTTPS Provider 端点；如需开发调试，请显式允许不安全传输。');
  }

  if (isPrivateHostname(parsedUrl.hostname) && !provider.allowPrivateNetwork) {
    throw new Error('默认禁止访问私有网络 Provider；如需本地调试，请显式允许私有网络。');
  }

  for (const headerName of Object.keys(provider.headers || {})) {
    if (FORBIDDEN_HEADER_NAMES.has(headerName.trim().toLowerCase())) {
      throw new Error(`不允许自定义请求头：${headerName}`);
    }
  }

  return parsedUrl;
}

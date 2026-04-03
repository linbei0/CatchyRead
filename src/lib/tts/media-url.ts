export function normalizeRemoteMediaUrl(url: string): string {
  if (/^http:\/\/.*\.aliyuncs\.com\//i.test(url)) {
    return url.replace(/^http:\/\//i, 'https://');
  }
  return url;
}

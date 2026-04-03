export async function readErrorMessageOnce(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();

  if (!rawText.trim()) {
    return '空响应体';
  }

  if (/json/i.test(contentType)) {
    try {
      const data = JSON.parse(rawText) as {
        error?: { message?: string };
        message?: string;
      };
      return data?.error?.message || data?.message || JSON.stringify(data);
    } catch {
      return rawText;
    }
  }

  return rawText;
}

export class RemoteAudioUrlCache {
  private entries = new Map<string, string>();

  constructor(private maxEntries = 3) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (!value) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, blob: Blob): string {
    const existing = this.entries.get(key);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.entries.delete(key);
    }

    const objectUrl = URL.createObjectURL(blob);
    this.entries.set(key, objectUrl);

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      const oldestUrl = this.entries.get(oldestKey);
      if (oldestUrl) {
        URL.revokeObjectURL(oldestUrl);
      }
      this.entries.delete(oldestKey);
    }

    return objectUrl;
  }

  clear(): void {
    for (const objectUrl of this.entries.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.entries.clear();
  }
}

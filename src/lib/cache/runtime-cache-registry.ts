export class RuntimeCacheRegistry {
  private groups = new Map<string, () => void>();

  register(group: string, clear: () => void): void {
    this.groups.set(group, clear);
  }

  clearGroup(group: string): void {
    this.groups.get(group)?.();
  }

  clearAll(): void {
    for (const clear of this.groups.values()) {
      clear();
    }
  }
}

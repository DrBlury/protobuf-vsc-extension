/**
 * Tracks documents currently being saved so we can suppress duplicate formatting requests.
 */

export class SaveStateTracker {
  private readonly savingDocuments = new Set<string>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly timeoutMs: number = 10000) {}

  mark(key: string | undefined | null): void {
    if (!key) {
      return;
    }

    this.savingDocuments.add(key);

    const existingTimer = this.cleanupTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.savingDocuments.delete(key);
      this.cleanupTimers.delete(key);
    }, this.timeoutMs);

    this.cleanupTimers.set(key, timer);
  }

  clear(key: string | undefined | null): void {
    if (!key) {
      return;
    }

    this.savingDocuments.delete(key);

    const timer = this.cleanupTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(key);
    }
  }

  isSaving(key: string | undefined | null): boolean {
    if (!key) {
      return false;
    }
    return this.savingDocuments.has(key);
  }

  dispose(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.savingDocuments.clear();
  }
}

type Callback = (data: any) => void;

export class EventBus {
  private static listeners: Map<string, Callback[]> = new Map();

  static on(event: string, callback: Callback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  static off(event: string, callback: Callback): void {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event)!.filter((cb) => cb !== callback);
    this.listeners.set(event, list);
  }

  static emit(event: string, data?: any): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (e) {
          dump(`[PaperPilot EventBus Error] ${event}: ${e}\n`);
        }
      }
    }
  }

  static clear(): void {
    this.listeners.clear();
  }
}

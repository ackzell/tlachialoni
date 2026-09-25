export type CommandHandler = (arg?: unknown) => void | Promise<void>;

/**
 * The single dispatch point for both keybindings and the palette (FR-020).
 */
export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register(id: string, handler: CommandHandler): void {
    this.handlers.set(id, handler);
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  async run(id: string, arg?: unknown): Promise<void> {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Unknown command: ${id}`);
    await handler(arg);
  }
}

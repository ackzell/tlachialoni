export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export type CommandHandler = (
  arg?: unknown,
) => void | CommandResult | Promise<void | CommandResult>;

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

  /** Returns the handler's result when it provides one (e.g. validation). */
  async run(id: string, arg?: unknown): Promise<void | CommandResult> {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Unknown command: ${id}`);
    return handler(arg);
  }
}

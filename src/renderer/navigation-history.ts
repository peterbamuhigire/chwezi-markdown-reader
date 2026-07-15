export interface NavigationEntry<TDocument, TState> {
  readonly document: TDocument;
  state: TState | null;
  readonly fragment: string | null;
}

export class NavigationHistory<TDocument, TState> {
  readonly #limit: number;
  #entries: NavigationEntry<TDocument, TState>[] = [];
  #index = -1;

  constructor(limit = 50) {
    this.#limit = Math.max(2, limit);
  }

  get canGoBack(): boolean { return this.#index > 0; }
  get canGoForward(): boolean { return this.#index >= 0 && this.#index < this.#entries.length - 1; }
  get current(): NavigationEntry<TDocument, TState> | null { return this.#entries[this.#index] ?? null; }

  push(document: TDocument, fragment: string | null = null): void {
    this.#entries.splice(this.#index + 1);
    this.#entries.push({ document, state: null, fragment });
    if (this.#entries.length > this.#limit) {
      this.#entries.shift();
    }
    this.#index = this.#entries.length - 1;
  }

  saveCurrentState(state: TState): void {
    const entry = this.#entries[this.#index];
    if (entry !== undefined) {
      entry.state = state;
    }
  }

  back(): NavigationEntry<TDocument, TState> | null {
    if (!this.canGoBack) return null;
    this.#index -= 1;
    return this.current;
  }

  forward(): NavigationEntry<TDocument, TState> | null {
    if (!this.canGoForward) return null;
    this.#index += 1;
    return this.current;
  }

  undoBack(): void {
    if (this.canGoForward) this.#index += 1;
  }

  undoForward(): void {
    if (this.canGoBack) this.#index -= 1;
  }
}

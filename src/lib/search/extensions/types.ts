export interface QueryExtensionResult {
  /** The transformed query string with this modifier removed/rewritten */
  query: string;
  /** A list of seed terms to OR-search separately (client-side OR) */
  seeds: string[];
  /** Post-filters that must all pass for an event's content */
  filters: Array<(content: string) => boolean>;
}

export interface QueryExtension {
  /** Unique name */
  name: string;
  /** Quick check to see if this extension should run */
  applies: (query: string) => boolean;
  /** Apply transformation. Must be pure. */
  apply: (query: string) => QueryExtensionResult;
}



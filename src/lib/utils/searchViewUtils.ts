/**
 * Pure helpers used by the search view and its hooks.
 */

/** True when the input is a slash command like `/help` */
export function isSlashCommand(input: string): boolean {
  return /^\s*\//.test(input);
}

/** True when the input is a plain http(s) URL */
export function isUrlQuery(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Build the CLI-style text shown in the slash command card */
export function buildCli(label: string, body: string | string[] = ''): string {
  const lines = Array.isArray(body) ? body : [body];
  return [`$ ants ${label}`, '', ...lines].join('\n');
}

// src/lib/escapeHtml.ts
//
// One-line HTML escaper for safe interpolation of user-controlled strings
// (notably gameState.username) into innerHTML template literals (D-14 / ACCT-02).
//
// The five replacements MUST run in this order — the ampersand replacement is
// FIRST so the entities introduced by the later replacements (&lt;, &gt;, &quot;,
// &#39;) are not themselves double-escaped.
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

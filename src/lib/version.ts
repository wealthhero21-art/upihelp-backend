// Minimal numeric-dotted version comparison (e.g. "1.2.0" vs "1.10.0").
// Non-numeric parts are treated as 0.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

export const lt = (a: string, b: string) => compareVersions(a, b) < 0;
export const gt = (a: string, b: string) => compareVersions(a, b) > 0;
export const gte = (a: string, b: string) => compareVersions(a, b) >= 0;

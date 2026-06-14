export interface CssGuardResult { ok: boolean; reasons: string[]; }

export function inspectThemeCss(css: string): CssGuardResult {
  const reasons: string[] = [];
  if (css.length > 100_000) reasons.push('CSS 超过 100KB 体积上限');
  if (/@import/i.test(css)) reasons.push('禁止 @import');
  if (/url\(\s*['"]?\s*(https?:)?\/\//i.test(css)) reasons.push('禁止远程 url()，资源只能来自主题目录');
  if (/expression\s*\(/i.test(css)) reasons.push('禁止 CSS expression()');
  if (/javascript\s*:/i.test(css)) reasons.push('禁止 javascript: 伪协议');
  if (/-moz-binding|behavior\s*:/i.test(css)) reasons.push('禁止 -moz-binding / behavior');
  return { ok: reasons.length === 0, reasons };
}

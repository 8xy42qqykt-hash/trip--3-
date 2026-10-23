const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const TRAILING_LINK_PUNCTUATION = /[),.!?;:]+$/;

export interface ParsedLink {
  href: string;
  displayUrl: string;
  host: string;
  path: string;
  start: number;
}

export function findFirstLink(content: string): ParsedLink | null {
  const match = LINK_PATTERN.exec(content);
  if (!match || match.index === undefined) return null;
  const displayUrl = match[0].replace(TRAILING_LINK_PUNCTUATION, '');
  if (!displayUrl) return null;
  const href = displayUrl.startsWith('www.') ? `https://${displayUrl}` : displayUrl;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return {
      href: parsed.href,
      displayUrl,
      host: parsed.hostname.replace(/^www\./i, ''),
      path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      start: match.index,
    };
  } catch {
    return null;
  }
}

export function removeFirstLink(content: string, link: ParsedLink): string {
  return `${content.slice(0, link.start)}${content.slice(link.start + link.displayUrl.length)}`.trim();
}

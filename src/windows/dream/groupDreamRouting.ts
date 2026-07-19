export function isGroupDreamDomain(domain: string | undefined): boolean {
  return domain === 'dream';
}

export function belongsToOpenGroupDream(
  domain: string | undefined,
  roundId: string | undefined,
  activeRounds: ReadonlySet<string>,
): boolean {
  return isGroupDreamDomain(domain)
    && (!roundId || activeRounds.size === 0 || activeRounds.has(roundId));
}

export function isOpenGroupDreamRound(
  frameGroupId: string,
  openGroupId: string,
  domain: string | undefined,
): boolean {
  return frameGroupId === openGroupId && isGroupDreamDomain(domain);
}

/** Reject stale/cross-character expression requests before any window sees them. */
export function createAvatarDirectiveGate() {
  const latest = new Map<string, { at: number; version: number }>();
  return (action: Record<string, unknown>, activeCharId: string, now = Date.now() / 1000): boolean => {
    if (action.type !== 'avatar_directive') return true;
    if (typeof action.char_id === 'string' && action.char_id !== activeCharId) return false;
    const versioned = ['version', 'source_at', 'source_turn_id', 'expires_at'].some(key => key in action);
    if (!versioned) return true;
    const { char_id, version, source_at, source_turn_id, expires_at } = action;
    if (char_id !== activeCharId || typeof source_turn_id !== 'string' || !source_turn_id
        || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1
        || typeof source_at !== 'number' || !Number.isFinite(source_at) || source_at > now + 30
        || typeof expires_at !== 'number' || !Number.isFinite(expires_at) || expires_at <= now) return false;
    const prior = latest.get(activeCharId);
    if (prior && (source_at < prior.at || (source_at === prior.at && version <= prior.version))) return false;
    latest.set(activeCharId, { at: source_at, version });
    if (latest.size > 32) latest.delete(latest.keys().next().value!);
    action.ttl_ms = Math.min(typeof action.ttl_ms === 'number' ? action.ttl_ms : 6000, (expires_at - now) * 1000);
    return true;
  };
}

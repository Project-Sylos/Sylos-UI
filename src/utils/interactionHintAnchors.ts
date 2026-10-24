/** First mounted eligible anchor wins for a tipId; others stay quiet. */
const holders = new Map<string, symbol>();

export function claimInteractionHint(tipId: string, token: symbol): boolean {
  const current = holders.get(tipId);
  if (current != null && current !== token) return false;
  holders.set(tipId, token);
  return true;
}

export function releaseInteractionHint(tipId: string, token: symbol): void {
  if (holders.get(tipId) === token) {
    holders.delete(tipId);
  }
}

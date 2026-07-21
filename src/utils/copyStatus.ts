/** Copy is satisfied: actual transfer or already on DST (root / traversal match). */
export function isCopyComplete(status: string | undefined | null): boolean {
  return status === "successful" || status === "already_existed";
}

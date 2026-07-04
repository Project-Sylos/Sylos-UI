import { DiffItem, PathNodeItem } from "../api/services";

function nodeFailureMessage(node?: PathNodeItem): string | undefined {
  if (!node?.failureMessage) {
    return undefined;
  }

  const copyFailed = node.copyStatus === "failed";
  const traversalFailed = node.traversalStatus === "failed";
  if (copyFailed || traversalFailed) {
    return node.failureMessage;
  }

  return undefined;
}

/** Failure text from src/dst nodes when copy or traversal failed. */
export function getDiffItemFailureMessage(item: DiffItem): string | undefined {
  return nodeFailureMessage(item.src) ?? nodeFailureMessage(item.dst);
}

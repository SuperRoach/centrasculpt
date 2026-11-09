/** Focus changes stop interactive edits, but must not cancel independent exports. */
export function exportInterruption(reason: string): Error | undefined {
  if (reason === "blur" || reason === "page hidden") return;
  const causes: Record<string, string> = {
    pagehide: "The page was closed or navigated away.",
    freeze: "The browser froze the page.",
    error: "An application error interrupted the export.",
    unhandledrejection: "An application error interrupted the export.",
  };
  return new Error(causes[reason] ?? `The editor interrupted the export (${reason}).`);
}
/** Preserve real errors, including an error arriving at the same time as Cancel.
 * An aborted signal alone is not evidence that the user requested cancellation. */
export function exportFailure(
  error: unknown,
  stage: string,
  aborted: boolean,
  abortReason?: unknown,
) {
  const reason = error instanceof Error ? error.message : String(error);
  if (aborted && /^Export cancelled[.!]?$/.test(reason)) {
    if (abortReason === "user")
      return { text: "Export cancelled by request. Source sculpture kept.", error: false };
    const cause =
      abortReason instanceof Error
        ? abortReason.message
        : typeof abortReason === "string"
          ? abortReason
          : "The application stopped the export; no cause was recorded.";
    return {
      text: `Export interrupted during ${stage}: ${cause} Source sculpture kept.`,
      error: true,
    };
  }
  return {
    text: `Export failed during ${stage}: ${reason} Source sculpture kept.`,
    error: true,
  };
}

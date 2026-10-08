/** The smallest scroll adjustment that keeps a link inside the rail's visible area. */
export function visibilityAdjustment(
  viewport: { top: number; bottom: number },
  link: { top: number; bottom: number },
): number {
  if (link.top < viewport.top) return link.top - viewport.top;
  if (link.bottom > viewport.bottom) return link.bottom - viewport.bottom;
  return 0;
}

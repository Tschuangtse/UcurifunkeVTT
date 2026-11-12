// The display limit never changes the data used for advancing time.
export function groupTimeline(items, limit = 0) {
  let visible = items;
  if (limit > 0) {
    const ticks = [...new Set(items.filter(item => !item.isEvent && !item.isWaiting)
      .map(item => item.ticks))].sort((a, b) => a - b);
    if (ticks.length > limit) {
      const cutoff = ticks[limit - 1];
      visible = items.filter(item => item.isWaiting || item.ticks <= cutoff);
    }
  }
  const groups = new Map();
  for (const item of visible) {
    if (!groups.has(item.ticks)) groups.set(item.ticks, { ticks: item.ticks, items: [] });
    groups.get(item.ticks).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.ticks - b.ticks);
}

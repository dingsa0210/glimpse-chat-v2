export function splitTextForTts(value: string, maxLength: number) {
  const chunks: string[] = [];
  let remaining = value.trim();
  const preferredBreaks = ["\n", "。", "！", "？", "!", "?", "；", ";", "，", ",", "、", ". ", " "];
  while (remaining.length > maxLength) {
    const windowText = remaining.slice(0, maxLength + 1);
    const minimumBreak = Math.floor(maxLength * 0.55);
    let cutAt = -1;
    for (const marker of preferredBreaks) {
      const candidate = windowText.lastIndexOf(marker);
      if (candidate >= minimumBreak) {
        cutAt = marker === ". " ? candidate + 1 : candidate + marker.length;
        break;
      }
    }
    if (cutAt <= 0) cutAt = maxLength;
    const chunk = remaining.slice(0, cutAt).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cutAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

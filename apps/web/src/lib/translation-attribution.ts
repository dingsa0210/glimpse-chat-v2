import type { ManualTranslation, ManualTranslationRevision } from "@glimpse/shared";

export type TranslationAttributionPart = {
  text: string;
  editor: ManualTranslationRevision | null;
};

const MAX_LCS_CELLS = 4_000_000;

type CharacterRange = { start: number; end: number };

function translationWordRanges(characters: string[]): CharacterRange[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const text = characters.join("");
    const characterIndexByUtf16Offset = new Map<number, number>();
    let utf16Offset = 0;
    characters.forEach((character, index) => {
      characterIndexByUtf16Offset.set(utf16Offset, index);
      utf16Offset += character.length;
    });
    characterIndexByUtf16Offset.set(utf16Offset, characters.length);
    const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text));
    const ranges = segments
      .filter((segment) => segment.isWordLike)
      .map((segment) => {
        const start = characterIndexByUtf16Offset.get(segment.index) ?? Array.from(text.slice(0, segment.index)).length;
        const endOffset = segment.index + segment.segment.length;
        const end = characterIndexByUtf16Offset.get(endOffset) ?? Array.from(text.slice(0, endOffset)).length;
        return { start, end };
      })
      .filter((range) => range.end > range.start);
    if (ranges.length) return ranges;
  }
  const ranges: CharacterRange[] = [];
  const isCjk = (character: string) => /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character);
  const isWordCharacter = (character: string) => /[\p{L}\p{M}\p{N}]/u.test(character);
  let index = 0;
  while (index < characters.length) {
    const character = characters[index] ?? "";
    if (isCjk(character)) {
      ranges.push({ start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (!isWordCharacter(character)) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < characters.length) {
      const nextCharacter = characters[index] ?? "";
      if (isCjk(nextCharacter) || !isWordCharacter(nextCharacter)) break;
      index += 1;
    }
    ranges.push({ start, end: index });
  }
  return ranges;
}

function markDeletionContext(
  characters: string[],
  owners: Array<ManualTranslationRevision | null>,
  insertionIndex: number,
  revision: ManualTranslationRevision
) {
  const words = translationWordRanges(characters);
  const before = words.filter((range) => range.end <= insertionIndex).slice(-2);
  const after = words.filter((range) => range.start >= insertionIndex).slice(0, 2);
  const containing = words.find((range) => range.start < insertionIndex && range.end > insertionIndex);
  const context = containing
    ? [
        ...words.filter((range) => range.end <= containing.start).slice(-2),
        containing,
        ...words.filter((range) => range.start >= containing.end).slice(0, 2)
      ]
    : [...before, ...after];
  for (const range of context) {
    for (let index = range.start; index < range.end; index += 1) owners[index] = revision;
  }
}

function lcsLengths(
  previous: string[],
  next: string[],
  previousStart: number,
  previousEnd: number,
  nextStart: number,
  nextEnd: number,
  reverse = false
) {
  const nextLength = nextEnd - nextStart;
  const lengths = new Uint32Array(nextLength + 1);
  const previousLength = previousEnd - previousStart;
  for (let previousOffset = 0; previousOffset < previousLength; previousOffset += 1) {
    const previousIndex = reverse
      ? previousEnd - 1 - previousOffset
      : previousStart + previousOffset;
    let diagonal = 0;
    for (let nextOffset = 1; nextOffset <= nextLength; nextOffset += 1) {
      const priorRow = lengths[nextOffset] ?? 0;
      const nextIndex = reverse
        ? nextEnd - nextOffset
        : nextStart + nextOffset - 1;
      lengths[nextOffset] = previous[previousIndex] === next[nextIndex]
        ? diagonal + 1
        : Math.max(priorRow, lengths[nextOffset - 1] ?? 0);
      diagonal = priorRow;
    }
  }
  return lengths;
}

function fillLinearSpaceAlignment(
  previous: string[],
  next: string[],
  mapping: Array<number | null>,
  previousStart: number,
  previousEnd: number,
  nextStart: number,
  nextEnd: number
) {
  const previousLength = previousEnd - previousStart;
  const nextLength = nextEnd - nextStart;
  if (!previousLength || !nextLength) return;
  if (previousLength === 1) {
    for (let nextIndex = nextStart; nextIndex < nextEnd; nextIndex += 1) {
      if (previous[previousStart] === next[nextIndex]) {
        mapping[nextIndex] = previousStart;
        break;
      }
    }
    return;
  }
  if (nextLength === 1) {
    for (let previousIndex = previousStart; previousIndex < previousEnd; previousIndex += 1) {
      if (previous[previousIndex] === next[nextStart]) {
        mapping[nextStart] = previousIndex;
        break;
      }
    }
    return;
  }

  const previousMiddle = previousStart + Math.floor(previousLength / 2);
  const leftLengths = lcsLengths(
    previous,
    next,
    previousStart,
    previousMiddle,
    nextStart,
    nextEnd
  );
  const rightLengths = lcsLengths(
    previous,
    next,
    previousMiddle,
    previousEnd,
    nextStart,
    nextEnd,
    true
  );
  let nextSplitOffset = 0;
  let bestLength = -1;
  for (let offset = 0; offset <= nextLength; offset += 1) {
    const length = (leftLengths[offset] ?? 0) + (rightLengths[nextLength - offset] ?? 0);
    if (length > bestLength) {
      bestLength = length;
      nextSplitOffset = offset;
    }
  }
  const nextMiddle = nextStart + nextSplitOffset;
  fillLinearSpaceAlignment(
    previous,
    next,
    mapping,
    previousStart,
    previousMiddle,
    nextStart,
    nextMiddle
  );
  fillLinearSpaceAlignment(
    previous,
    next,
    mapping,
    previousMiddle,
    previousEnd,
    nextMiddle,
    nextEnd
  );
}

function minimumChangeAlignment(previous: string[], next: string[]) {
  const mapping: Array<number | null> = Array.from({ length: next.length }, () => null);
  if (!previous.length || !next.length) {
    return mapping;
  }

  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) {
    mapping[prefix] = prefix;
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    mapping[next.length - 1 - suffix] = previous.length - 1 - suffix;
    suffix += 1;
  }

  const previousMiddleLength = previous.length - prefix - suffix;
  const nextMiddleLength = next.length - prefix - suffix;
  if (!previousMiddleLength || !nextMiddleLength) return mapping;
  if ((previousMiddleLength + 1) * (nextMiddleLength + 1) > MAX_LCS_CELLS) {
    fillLinearSpaceAlignment(
      previous,
      next,
      mapping,
      prefix,
      previous.length - suffix,
      prefix,
      next.length - suffix
    );
    return mapping;
  }

  const columnCount = nextMiddleLength + 1;
  const lengths = new Uint32Array((previousMiddleLength + 1) * columnCount);
  for (let previousIndex = 1; previousIndex <= previousMiddleLength; previousIndex += 1) {
    const rowOffset = previousIndex * columnCount;
    const priorRowOffset = (previousIndex - 1) * columnCount;
    for (let nextIndex = 1; nextIndex <= nextMiddleLength; nextIndex += 1) {
      lengths[rowOffset + nextIndex] = previous[prefix + previousIndex - 1] === next[prefix + nextIndex - 1]
        ? (lengths[priorRowOffset + nextIndex - 1] ?? 0) + 1
        : Math.max(
            lengths[priorRowOffset + nextIndex] ?? 0,
            lengths[rowOffset + nextIndex - 1] ?? 0
          );
    }
  }

  let previousIndex = previousMiddleLength;
  let nextIndex = nextMiddleLength;
  while (previousIndex > 0 && nextIndex > 0) {
    if (previous[prefix + previousIndex - 1] === next[prefix + nextIndex - 1]) {
      mapping[prefix + nextIndex - 1] = prefix + previousIndex - 1;
      previousIndex -= 1;
      nextIndex -= 1;
      continue;
    }
    const priorRowLength = lengths[(previousIndex - 1) * columnCount + nextIndex] ?? 0;
    const priorColumnLength = lengths[previousIndex * columnCount + nextIndex - 1] ?? 0;
    if (priorRowLength >= priorColumnLength) previousIndex -= 1;
    else nextIndex -= 1;
  }
  return mapping;
}

export function translationAttributionParts(
  original: string,
  manual: ManualTranslation | undefined
): TranslationAttributionPart[] {
  if (!manual) return [];
  const revisions = manual.revisions?.length ? manual.revisions : [manual];
  let currentCharacters = Array.from(original);
  let owners: Array<ManualTranslationRevision | null> = Array.from(
    { length: currentCharacters.length },
    () => null
  );

  for (const revision of revisions) {
    const nextCharacters = Array.from(revision.body);
    const alignment = minimumChangeAlignment(currentCharacters, nextCharacters);
    const nextOwners = alignment.map((previousIndex) =>
      previousIndex === null ? revision : owners[previousIndex] ?? null
    );
    const mappedPreviousIndexes = new Set(
      alignment.filter((previousIndex): previousIndex is number => previousIndex !== null)
    );
    const isDeletionOnly = currentCharacters.some((_, index) => !mappedPreviousIndexes.has(index))
      && alignment.every((previousIndex) => previousIndex !== null);
    if (isDeletionOnly) {
      let deletedStart = -1;
      for (let previousIndex = 0; previousIndex <= currentCharacters.length; previousIndex += 1) {
        const deleted = previousIndex < currentCharacters.length && !mappedPreviousIndexes.has(previousIndex);
        if (deleted && deletedStart < 0) deletedStart = previousIndex;
        if ((!deleted || previousIndex === currentCharacters.length) && deletedStart >= 0) {
          const deletedEnd = previousIndex - 1;
          const insertionIndex = alignment.findIndex((mappedIndex) => mappedIndex !== null && mappedIndex > deletedEnd);
          markDeletionContext(
            nextCharacters,
            nextOwners,
            insertionIndex < 0 ? nextCharacters.length : insertionIndex,
            revision
          );
          deletedStart = -1;
        }
      }
    }
    owners = nextOwners;
    currentCharacters = nextCharacters;
  }

  const parts: TranslationAttributionPart[] = [];
  for (let index = 0; index < currentCharacters.length; index += 1) {
    const editor = owners[index] ?? null;
    const previousPart = parts.at(-1);
    if (
      previousPart &&
      (previousPart.editor?.editedById === editor?.editedById || (!previousPart.editor && !editor))
    ) {
      previousPart.text += currentCharacters[index];
    } else {
      parts.push({ text: currentCharacters[index] ?? "", editor });
    }
  }
  return parts;
}

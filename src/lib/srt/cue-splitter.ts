import { MAX_CHARS, type SrtCue, type WhisperSegment, type WhisperWord } from './types'

function charCount(text: string): number {
  return text.replace(/\s+/g, '').length
}

export function splitIntoCues(
  segments: WhisperSegment[],
  words: WhisperWord[],
): SrtCue[] {
  const cues: SrtCue[] = []
  let index = 1

  for (const seg of segments) {
    const segWords = words.filter(w => w.start >= seg.start && w.end <= seg.end + 0.01)

    if (segWords.length === 0) {
      cues.push({ index: index++, start: seg.start, end: seg.end, text: seg.text.trim() })
      continue
    }

    if (charCount(seg.text) <= MAX_CHARS) {
      cues.push({ index: index++, start: seg.start, end: seg.end, text: seg.text.trim() })
      continue
    }

    let buf: WhisperWord[] = []
    let bufChars = 0
    for (const w of segWords) {
      const wChars = charCount(w.word)
      if (buf.length > 0 && bufChars + wChars > MAX_CHARS) {
        cues.push({
          index: index++,
          start: buf[0].start,
          end: buf[buf.length - 1].end,
          text: buf.map(x => x.word).join(' '),
        })
        buf = []
        bufChars = 0
      }
      buf.push(w)
      bufChars += wChars
    }
    if (buf.length > 0) {
      cues.push({
        index: index++,
        start: buf[0].start,
        end: buf[buf.length - 1].end,
        text: buf.map(x => x.word).join(' '),
      })
    }
  }

  return cues
}

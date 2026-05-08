export interface SrtCue {
  index: number
  start: number  // seconds
  end: number    // seconds
  text: string
}

export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface WhisperSegment {
  id: number
  start: number
  end: number
  text: string
}

export interface WhisperResponse {
  text: string
  segments: WhisperSegment[]
  words: WhisperWord[]
}

export const MAX_CHARS = 10

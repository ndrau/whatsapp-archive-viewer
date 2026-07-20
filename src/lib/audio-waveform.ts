export interface AudioWaveformData {
  peaks: number[];
  duration: number;
}

const waveformCache = new Map<string, Promise<AudioWaveformData>>();

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createFallbackWaveform(seed: string, bars = 48): number[] {
  const base = hashString(seed);
  return Array.from({ length: bars }, (_, index) => {
    const wave = Math.sin((base % 997) * 0.11 + index * 0.65) * 0.5 + 0.5;
    const noise = ((base >> (index % 12)) & 7) / 14;
    return 0.15 + wave * 0.55 + noise * 0.2;
  });
}

function normalizePeaks(values: number[], bars: number): number[] {
  if (values.length === 0) {
    return createFallbackWaveform("empty", bars);
  }

  const bucketSize = Math.max(1, Math.floor(values.length / bars));
  const peaks: number[] = [];

  for (let index = 0; index < bars; index += 1) {
    const start = index * bucketSize;
    const end = Math.min(values.length, start + bucketSize);
    let max = 0;

    for (let sample = start; sample < end; sample += 1) {
      max = Math.max(max, values[sample] ?? 0);
    }

    peaks.push(max);
  }

  const peakMax = Math.max(...peaks, 0.001);
  return peaks.map((peak) => 0.12 + (peak / peakMax) * 0.88);
}

async function decodeWaveform(src: string, bars: number): Promise<AudioWaveformData> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Audio konnte nicht geladen werden.");
  }

  const buffer = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const samples: number[] = [];

    const step = Math.max(1, Math.floor(channel.length / 4000));
    for (let index = 0; index < channel.length; index += step) {
      samples.push(Math.abs(channel[index] ?? 0));
    }

    return {
      peaks: normalizePeaks(samples, bars),
      duration: audioBuffer.duration,
    };
  } finally {
    await audioContext.close();
  }
}

export function loadAudioWaveform(src: string, bars = 48): Promise<AudioWaveformData> {
  const cacheKey = `${src}:${bars}`;
  const cached = waveformCache.get(cacheKey);

  if (cached) return cached;

  const pending = decodeWaveform(src, bars).catch(() => ({
    peaks: createFallbackWaveform(src, bars),
    duration: 0,
  }));

  waveformCache.set(cacheKey, pending);
  return pending;
}

export function barHeight(peak: number, maxHeight = 22): number {
  return Math.max(3, Math.round(peak * maxHeight));
}

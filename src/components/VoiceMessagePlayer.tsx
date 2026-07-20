"use client";

import { useEffect, useRef, useState } from "react";

import { barHeight, loadAudioWaveform } from "@/lib/audio-waveform";

const WAVEFORM_BARS = 48;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function avatarColor(name: string): string {
  const palette = ["#6a7175", "#7f66ff", "#009de2", "#007bfc", "#ff6b6b", "#00a884", "#8696a0"];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

interface VoiceMessagePlayerProps {
  src: string;
  filename: string;
  sender: string;
  timestamp: string;
}

export function VoiceMessagePlayer({
  src,
  filename,
  sender,
  timestamp,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: WAVEFORM_BARS }, () => 0.2),
  );

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const displayDuration = isPlaying || currentTime > 0 ? currentTime : duration;

  useEffect(() => {
    let cancelled = false;

    loadAudioWaveform(src, WAVEFORM_BARS).then((data) => {
      if (cancelled) return;
      setWaveform(data.peaks);
      if (data.duration > 0) {
        setDuration(data.duration);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onLoadedMetadata() {
      if (!audio) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration((current) => (current > 0 ? current : audio.duration));
      }
    }

    function onTimeUpdate() {
      if (!audio) return;
      if (!isPlaying) {
        setCurrentTime(audio.currentTime);
      }
    }

    function onEnded() {
      if (!audio) return;
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    }

    function onPause() {
      if (!audio) return;
      setIsPlaying(false);
      setCurrentTime(audio.currentTime);
    }

    function onPlay() {
      setIsPlaying(true);
    }

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [isPlaying, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    let frame = 0;

    const tick = () => {
      setCurrentTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  }

  function handleSeek(clientX: number) {
    const audio = audioRef.current;
    const waveformEl = waveformRef.current;
    if (!audio || !waveformEl || duration <= 0) return;

    const rect = waveformEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = ratio * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="voice-message mb-0.5 min-w-[260px] max-w-[340px]">
      <audio ref={audioRef} preload="auto" src={src} className="hidden" />

      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5 shrink-0">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: avatarColor(sender) }}
          >
            {initials(sender)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white bg-[#8696a0] text-white shadow-sm">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2.5 w-2.5 fill-current">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a1 1 0 0 0-1 1 8 8 0 0 0 16 0 1 1 0 0 0-1-1h-2Z" />
            </svg>
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void togglePlayback()}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-[#54656f]"
              aria-label={isPlaying ? "Pause" : "Abspielen"}
            >
              {isPlaying ? (
                <span className="flex gap-[3px]">
                  <span className="block h-3.5 w-[3px] rounded-sm bg-current" />
                  <span className="block h-3.5 w-[3px] rounded-sm bg-current" />
                </span>
              ) : (
                <span className="ml-0.5 block h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
              )}
            </button>

            <div
              ref={waveformRef}
              role="slider"
              aria-label="Wiedergabeposition"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              tabIndex={0}
              onClick={(event) => handleSeek(event.clientX)}
              onKeyDown={(event) => {
                const audio = audioRef.current;
                if (!audio || duration <= 0) return;

                if (event.key === "ArrowRight") {
                  audio.currentTime = Math.min(duration, audio.currentTime + 1);
                  setCurrentTime(audio.currentTime);
                }
                if (event.key === "ArrowLeft") {
                  audio.currentTime = Math.max(0, audio.currentTime - 1);
                  setCurrentTime(audio.currentTime);
                }
              }}
              className="relative h-7 min-w-0 flex-1 cursor-pointer"
            >
              <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-end gap-[2px]">
                {waveform.map((peak, index) => {
                  const barProgress = (index + 0.5) / waveform.length;
                  const played = barProgress <= progress;

                  return (
                    <span
                      key={`${filename}-${index}`}
                      className={`block w-[2px] rounded-full transition-colors duration-75 ${
                        played ? "bg-[#667781]" : "bg-[#8696a0]/45"
                      }`}
                      style={{ height: `${barHeight(peak)}px` }}
                    />
                  );
                })}
              </div>

              <span
                className="pointer-events-none absolute top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#111b21] shadow-sm"
                style={{ left: `calc(${progress * 100}% - 5px)` }}
              />
            </div>
          </div>

          <div className="mt-0.5 flex items-end justify-between gap-3 pl-9">
            <span className="text-[11px] leading-none text-[#667781]">
              {formatDuration(displayDuration)}
            </span>
            <span className="text-[11px] leading-none text-[#667781]">{timestamp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

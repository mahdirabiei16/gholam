import React, { useEffect, useState } from 'react';
import { VoiceState } from '../types/app';

interface WaveformVisualizerProps {
  voiceState: VoiceState;
  getLevels: (barCount: number) => number[];
}

const BAR_COUNT = 30;

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  voiceState,
  getLevels,
}) => {
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.14));

  useEffect(() => {
    let rafId = 0;
    let tick = 0;

    const renderFrame = () => {
      tick += 0.08;
      if (voiceState === 'listening' || voiceState === 'speaking') {
        setBars(getLevels(BAR_COUNT));
      } else if (voiceState === 'thinking') {
        setBars(
          Array.from({ length: BAR_COUNT }, (_, idx) => {
            const wave = Math.sin(tick * 2.1 + idx * 0.42) * 0.24 + 0.34;
            return Math.max(0.12, Math.min(0.75, wave));
          })
        );
      } else {
        setBars(
          Array.from({ length: BAR_COUNT }, (_, idx) => {
            const distFromCenter = Math.abs(idx - BAR_COUNT / 2) / (BAR_COUNT / 2);
            const calm = (1 - distFromCenter) * 0.16 + Math.sin(tick + idx * 0.32) * 0.04 + 0.1;
            return Math.max(0.08, calm);
          })
        );
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [voiceState, getLevels]);

  const barColor =
    voiceState === 'listening'
      ? '#ff7a2f'
      : voiceState === 'speaking'
      ? '#1fe0c5'
      : voiceState === 'thinking'
      ? '#94a3b8'
      : 'rgba(255, 255, 255, 0.2)';

  return (
    <div
      className="flex h-16 w-full max-w-md items-center justify-center gap-1.5 px-3"
      aria-hidden="true"
    >
      {bars.map((level, index) => (
        <span
          key={index}
          className="w-1 rounded-full transition-[height,background-color] duration-75"
          style={{
            height: `${Math.max(5, Math.round(level * 56))}px`,
            backgroundColor: barColor,
          }}
        />
      ))}
    </div>
  );
};

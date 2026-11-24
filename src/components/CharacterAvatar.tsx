import React, { useState } from 'react';
import { User } from 'lucide-react';
import { VoiceState } from '../types/app';

interface CharacterAvatarProps {
  name: string;
  avatarUrl: string;
  accentColor: string;
  voiceState?: VoiceState;
  size?: 'lg' | 'md';
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  name,
  avatarUrl,
  accentColor,
  voiceState = 'idle',
  size = 'lg',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const ringColor =
    voiceState === 'listening'
      ? '#ff7a2f'
      : voiceState === 'speaking'
      ? '#1fe0c5'
      : accentColor;

  const isAnimated = voiceState === 'listening' || voiceState === 'speaking';
  const dimensions = size === 'lg' ? 'h-36 w-36 sm:h-40 sm:w-40' : 'h-24 w-24';
  const wrapDimensions = size === 'lg' ? 'h-40 w-40 sm:h-44 sm:w-44' : 'h-24 w-24';

  return (
    <div className={`relative grid place-items-center ${wrapDimensions}`}>
      {size === 'lg' && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-3 rounded-full blur-2xl transition-all duration-300 ${
            isAnimated ? 'scale-110 opacity-75' : 'scale-95 opacity-35'
          }`}
          style={{
            background: `radial-gradient(circle, ${ringColor} 0%, transparent 70%)`,
          }}
        />
      )}

      <div
        className={`relative z-10 overflow-hidden rounded-full border-2 bg-[#161a24] shadow-2xl transition-all duration-300 ${dimensions}`}
        style={{
          borderColor: isAnimated ? ringColor : 'rgba(255,255,255,0.16)',
          boxShadow: isAnimated ? `0 0 32px -4px ${ringColor}66` : '0 18px 40px rgba(0,0,0,0.55)',
        }}
      >
        {!imgFailed ? (
          <img
            src={avatarUrl}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#181c28] text-slate-300">
            <User className="h-10 w-10 text-slate-400" />
            <span className="mt-1 text-xs font-semibold">{name}</span>
          </div>
        )}
      </div>
    </div>
  );
};

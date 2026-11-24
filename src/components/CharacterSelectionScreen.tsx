import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Character } from '../types/app';
import { CharacterAvatar } from './CharacterAvatar';

interface CharacterSelectionScreenProps {
  characters: Character[];
  activeCharacterId: string;
  onStartConversation: (character: Character) => void;
}

export const CharacterSelectionScreen: React.FC<CharacterSelectionScreenProps> = ({
  characters,
  activeCharacterId,
  onStartConversation,
}) => {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-extrabold text-white">انتخاب شخصیت هم‌صحبت</h1>
        <p className="text-sm text-slate-400">
          هر شخصیت لحن گفتار، حافظه گفتگو و صدای اختصاصی خودش را دارد. یک هم‌صحبت انتخاب کن و گفتگو را شروع کن.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((character) => {
          const isCurrent = character.id === activeCharacterId;
          return (
            <article
              key={character.id}
              className={`flex flex-col items-center rounded-3xl border bg-[#12151e] p-6 text-center transition-colors ${
                isCurrent ? 'border-[#1fe0c5]/60' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <CharacterAvatar
                name={character.name}
                avatarUrl={character.avatarUrl}
                accentColor={character.accentColor}
                size="md"
              />

              <h2 className="mt-4 text-xl font-bold text-white">{character.name}</h2>
              <p className="mt-1 text-xs font-medium text-[#1fe0c5]">{character.shortRole}</p>

              <p className="mt-3 flex-1 text-sm leading-7 text-slate-300">
                {character.personalityDescription}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                صدا: {character.voiceDescription}
              </p>

              <button
                type="button"
                onClick={() => onStartConversation(character)}
                className={`mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                  isCurrent
                    ? 'bg-[#ff7a2f] text-[#0b0d12] hover:bg-[#ff8a47]'
                    : 'bg-[#1fe0c5] text-[#0b0d12] hover:bg-[#3de8d0]'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                <span>{isCurrent ? 'ادامه گفتگو' : 'شروع گفتگو'}</span>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
};

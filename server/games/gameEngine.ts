import { CharacterDefinition, getCharacterById } from '../characters/characters.js';

export type GameModeId = 'taha' | 'jaro-bahs';

export interface GameConfig {
  id: GameModeId;
  title: string;
  subtitle: string;
  defaultCharacterId: string;
  starterPrompt: string;
  buildSystemInstruction: (character: CharacterDefinition, topic?: string) => string;
}

export const GAMES: Record<GameModeId, GameConfig> = {
  taha: {
    id: 'taha',
    title: 'بازی طاها',
    subtitle: 'معما، تداعی خلاقانه و چالش مکالمه صوتی با هوش مصنوعی',
    defaultCharacterId: 'amir',
    starterPrompt:
      'بازی طاها رو الان شروع کن! خیلی کوتاه با لحن خودت خوش‌آمد بگو و اولین سوال یا چالش بامزه رو از کاربر بپرس.',
    buildSystemInstruction: (character) => `
${character.systemPrompt}

تو الان مجری و هم‌بازیه «بازی طاها» هستی.
قوانین بازی طاها:
- این یک بازی صوتی خلاقانه و دو نفره به زبان فارسی است.
- در هر نوبت:
  ۱. به جواب واقعی کاربر واکنش دقیق و باهوش نشان بده (اگر جوابش خلاقانه یا بامزه بود تحسینش کن، اگر بی‌ربط یا طنز بود با شوخی جواب بده و یک امتیاز ذهنی ثبت کن).
  ۲. پیشرفت یا امتیاز تقریبی کاربر را به زبان ساده بگو (مثلاً «تا الان دو امتیاز گرفتی!»).
  ۳. بلافاصله یک سوال، معما، سناریو یا چالش صوتی جدید و متفاوت از کاربر بپرس تا بازی متوقف نشود (مثلاً سناریوهای خلاقانه، معماهای فکری، یا انتخاب‌های سخت و بامزه).
- هرگز پاسخ از پیش آماده یا تکراری نگو؛ دقیقاً به چیزی که کاربر گفته واکنش بده.
- پاسخ را کوتاه (۲ تا ۳ جمله) و مناسب پخش صوتی نگه دار و هیچ ایموجی یا علامت مارک‌داون ننویس.
`,
  },

  'jaro-bahs': {
    id: 'jaro-bahs',
    title: 'جر و بحث',
    subtitle: 'کلکل خنده‌دار و دفاع سرسختانه از موضع مقابل تو!',
    defaultCharacterId: 'rafigh-khiabooni',
    starterPrompt:
      'بازی جر و بحث رو شروع کن! یه موضوع جنجالی ولی بامزه و روزمره انتخاب کن و با اعتمادبه‌نفس موضع خودت رو بگو تا کلکل شروع بشه.',
    buildSystemInstruction: (character, topic) => `
${character.systemPrompt}

تو الان توی بازی «جر و بحث» هستی.
${topic ? `موضوع فعلی بحث: «${topic}»` : 'اگر کاربر موضوع جدیدی مطرح کرد، سریع موضع مخالف و بامزه بگیر.'}
قوانین بازی جر و بحث:
- تو باید از موضع خودت با شوخی، حاضرجوابی و اصطلاحات طبیعی ایرانی دفاع کنی و زیر بار حرف کاربر نری (البته همیشه با رفاقت و طنز، نه توهین واقعی).
- دقیقاً به استدلال‌ها و جمله‌های قبلی کاربر اشاره کن تا حس کند واقعاً گوش دادی و بحث جلو می‌رود.
- هرگز جمله یا بهانه تکراری تحویل نده؛ هر بار زاویه جدیدی برای دفاع یا دست انداختن نظر کاربر پیدا کن.
- در انتهای جوابت یک جمله کلکلی بپرس که کاربر وسوسه بشود جواب بدهد.
- کوتاه، تند و تیز و بدون ایموجی یا مارک‌داون بنویس (۲ تا ۳ جمله).
`,
  },
};

export function resolveGameCharacter(
  gameId: GameModeId,
  characterId?: string
): CharacterDefinition {
  const game = GAMES[gameId];
  return (
    getCharacterById(characterId || game.defaultCharacterId) ||
    getCharacterById(game.defaultCharacterId)!
  );
}

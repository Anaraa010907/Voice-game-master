import { t } from './lang.ts';

export type GameType = 'mafia' | 'whoami';
export type GameCategory = 'card';

export type GameInfo = {
  type: GameType;
  category: GameCategory;
  title: string;
  tagline: string;
  players: string;
  duration: string;
  minPlayers: number;
  sizes: number[];
  defaultSize: number;
  defaultRoomName: string;
  /** The host may fill empty seats with bots. Mafia bots are for testing only; turn this off to remove them. */
  allowBots: boolean;
};

export const GAMES: Record<GameType, GameInfo> = {
  mafia: {
    type: 'mafia',
    category: 'card',
    title: t('Мафи: Сүүдэр', 'Mafia: Shadows'),
    tagline: t('Нууц дүр, шөнийн үйлдэл, дуугаар маргалдах санал хураалт.', 'Secret roles, night actions and heated voice debates before the vote.'),
    players: t('4–12 тоглогч', '4–12 players'),
    duration: t('15–25 мин', '15–25 min'),
    minPlayers: 4,
    sizes: [6, 8, 10, 12],
    defaultSize: 8,
    defaultRoomName: t('Блэкуотерын шөнө', 'Blackwater Night'),
    allowBots: false,
  },
  whoami: {
    type: 'whoami',
    category: 'card',
    title: t('Би хэн бэ', 'Who Am I'),
    tagline: t('Бусад нь таны нууц дүрийг харна, та л харахгүй. Тийм/үгүй асуултаар тааж ол.', 'Everyone sees your secret identity except you. Find it with yes/no questions.'),
    players: t('3–10 тоглогч', '3–10 players'),
    duration: t('10–20 мин', '10–20 min'),
    minPlayers: 3,
    sizes: [3, 4, 5, 6, 7, 8, 9, 10],
    defaultSize: 6,
    defaultRoomName: t('Хэн бэ би?', 'Guess Who I Am'),
    /** Bots cannot hear voice questions, so Who Am I is for people only. */
    allowBots: false,
  },
};

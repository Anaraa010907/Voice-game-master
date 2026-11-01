import { t } from './lang.ts';

export type GameType = 'mafia' | 'monopoly';
export type GameCategory = 'card' | 'board';

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
  monopoly: {
    type: 'monopoly',
    category: 'board',
    title: t('Монгол Монополь', 'Mongol Monopoly'),
    tagline: t('Аймаг, хот, байгалийн газруудыг худалдаж аваад гэр бааз барь.', 'Buy provinces, cities and natural wonders, and build ger camps.'),
    players: t('2–6 тоглогч', '2–6 players'),
    duration: t('30–60 мин', '30–60 min'),
    minPlayers: 2,
    sizes: [2, 3, 4, 5, 6],
    defaultSize: 4,
    defaultRoomName: t('Талын наймаа', 'Steppe Trade'),
    allowBots: true,
  },
};

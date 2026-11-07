import { t } from './lang.ts';

export type GameType = 'mafia';
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
};

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
    title: 'Мафи: Сүүдэр',
    tagline: 'Нууц дүр, шөнийн үйлдэл, дуугаар маргалдах санал хураалт.',
    players: '4–12 тоглогч',
    duration: '15–25 мин',
    minPlayers: 4,
    sizes: [6, 8, 10, 12],
    defaultSize: 8,
    defaultRoomName: 'Блэкуотерын шөнө',
    allowBots: true,
  },
};

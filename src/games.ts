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
  monopoly: {
    type: 'monopoly',
    category: 'board',
    title: 'Монгол Монополь',
    tagline: 'Аймаг, хот, байгалийн газруудыг худалдаж аваад гэр бааз барь.',
    players: '2–6 тоглогч',
    duration: '20–40 мин',
    minPlayers: 2,
    sizes: [2, 3, 4, 5, 6],
    defaultSize: 4,
    defaultRoomName: 'Талын наймаа',
    allowBots: true,
  },
};

/** Games that are planned but not playable yet, shown greyed out in the hub. */
export const COMING_SOON: Array<{ category: GameCategory; title: string; tagline: string }> = [
  { category: 'card', title: 'Тагнуулын ширээ', tagline: 'Spyfall маягийн дуут тоглоом. Хэн тагнуул вэ?' },
  { category: 'board', title: 'Талын уралдаан', tagline: 'Морин уралдааны шоотой самбарын тоглоом.' },
];

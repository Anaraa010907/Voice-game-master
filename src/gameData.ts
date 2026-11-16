import {
  Crosshair, Crown, Drama, Eye, Fingerprint, HeartPulse, Radio, Shield, ShieldHalf, Skull, Users,
} from 'lucide-react';

import type { RoleName } from './gameEngine';
import { t } from './lang';
export type { RoleName };

export type Role = {
  id: string;
  name: RoleName;
  displayName: string;
  faction: 'citizens' | 'mafia' | 'neutral';
  description: string;
  ability: string;
  /** Short ability text printed on the card. */
  cardText: string;
  /** The role's picture (left side of the card); the text side is drawn by the app in the player's language. */
  portrait: string;
  team: 'town' | 'mafia' | 'wildcard';
  icon: typeof Shield;
};

export type Player = {
  id: number;
  name: string;
  initials: string;
  color: string;
  host?: boolean;
  ready?: boolean;
  status?: string;
};

const PORTRAITS = '/assets/cards/portraits';

export const roles: Role[] = [
  {
    id: 'mafia-member', name: 'Mafia', faction: 'mafia', team: 'mafia', icon: Skull, portrait: `${PORTRAITS}/mafia-member.webp`,
    displayName: t('Мафийн гишүүн', 'Mafioso'),
    description: t('Мафийн бүлгийн нууц гишүүн.', 'A secret member of the Mafia.'),
    ability: t('Шөнө нэг тоглогчийг онилж, багийн довтолгоог сонгоно.', 'At night, pick a target and choose the crew’s attack.'),
    cardText: t('Шөнө бүр мафийн багтайгаа хамт нэг хүнийг сонгож довтолно. Өдөр иргэдийг төөрөгдүүл.', 'Each night, choose a victim with the rest of the Mafia. By day, lead the town astray.'),
  },
  {
    id: 'don', name: 'Don', faction: 'mafia', team: 'mafia', icon: Crown, portrait: `${PORTRAITS}/don.webp`,
    displayName: t('Дон', 'Don'),
    description: t('Мафийн толгойлогч.', 'The head of the Mafia.'),
    ability: t('Мафийн гишүүдтэй хамт шөнө довтолно. Гишүүд өөр өөр хүн сонговол таны сонголт эцсийнх. Цагдаа таныг шалгавал «мафи биш» гэж гарна.', 'You attack at night with the Mafia. If they pick different targets, your choice is final. If the Detective checks you, you show as not Mafia.'),
    cardText: t('Мафийг удирдана. Довтолгооны эцсийн шийдвэр таных. Цагдаа таныг шалгавал «мафи биш» гэж гарна.', 'You lead the Mafia and make the final call on each attack. The Detective sees you as innocent.'),
  },
  {
    id: 'police-officer', name: 'Detective', faction: 'citizens', team: 'town', icon: Eye, portrait: `${PORTRAITS}/police-officer.webp`,
    displayName: t('Цагдаа', 'Detective'),
    description: t('Иргэдийн багийн мөрдөгч.', 'The town’s investigator.'),
    ability: t('Шөнө бүр амьд байгаа нэг тоглогчийг шалгаж, тухайн тоглогч Мафийн бүлэгт хамаарах эсэхийг олж мэднэ. Бүх шалгалтын үр дүн таны нууц тэмдэглэлд хадгалагдана.', 'Each night, check one living player to learn whether they belong to the Mafia. Every result is kept in your private notes.'),
    cardText: t('Шөнө бүр нэг тоглогчийг шалгаж, мафийн талынх эсэхийг олж мэднэ.', 'Each night, investigate one player to learn whether they side with the Mafia.'),
  },
  {
    id: 'doctor', name: 'Doctor', faction: 'citizens', team: 'town', icon: HeartPulse, portrait: `${PORTRAITS}/doctor.webp`,
    displayName: t('Эмч', 'Doctor'),
    description: t('Иргэдийн багийн эмч.', 'The town’s doctor.'),
    ability: t('Шөнө бүр нэг амьд тоглогчийг сонгон хамгаална. Мафийн халдлагад өртсөн бол хамгаалсан тоглогч амьд үлдэнэ. Өөрийгөө ч хамгаалж болно, гэхдээ нэг хүнийг хоёр шөнө дараалан хамгаалж болохгүй.', 'Each night, protect one living player. If the Mafia attack them, they survive. You may protect yourself, but not the same player two nights in a row.'),
    cardText: t('Шөнө бүр нэг хүнийг хамгаалж, мафийн халдлагаас аварна. Нэг хүнийг хоёр шөнө дараалан хамгаалж болохгүй.', 'Each night, protect one player from the Mafia. Never the same player two nights in a row.'),
  },
  {
    id: 'bodyguard', name: 'Bodyguard', faction: 'citizens', team: 'town', icon: ShieldHalf, portrait: `${PORTRAITS}/bodyguard.webp`,
    displayName: t('Бие хамгаалагч', 'Bodyguard'),
    description: t('Иргэдийн багийн хамгаалагч.', 'The town’s protector.'),
    ability: t('Шөнө бүр өөрөөсөө бусад нэг тоглогчийг хамгаална. Тэр хүн рүү мафи довтолбол та оронд нь амиа өгч, түүнийг аварна. Эмч түрүүлж хамгаалсан бол та амьд үлдэнэ.', 'Each night, guard one other player. If the Mafia attack them, you die in their place and save them. If the Doctor protected them first, you survive.'),
    cardText: t('Шөнө нэг хүнийг хамгаалж, халдлагад түүний оронд амиа өгнө.', 'Each night, guard one player and take the attack in their place.'),
  },
  {
    id: 'good-informant', name: 'Good Informant', faction: 'citizens', team: 'town', icon: Fingerprint, portrait: `${PORTRAITS}/good-informant.webp`,
    displayName: t('Сайн мэдээлэгч', 'Informant'),
    description: t('Мафийн тухай нууц мэдээлэл цуглуулдаг иргэн.', 'A citizen who gathers secrets about the Mafia.'),
    ability: t('Мафийн гишүүдийн хэн болохыг нууцаар мэдэж авна. Олж авсан мэдээлэл зөвхөн танд харагдана.', 'You secretly learn who the Mafia members are. Only you can see what you learn.'),
    cardText: t('Мафийн гишүүдийн хэн болохыг нууцаар мэдэж авна. Олж мэдсэн зүйл зөвхөн танд харагдана.', 'You secretly know who the Mafia are. Only you can see what you’ve learned.'),
  },
  {
    id: 'mafia-informant', name: 'Bad Informant', faction: 'mafia', team: 'mafia', icon: Radio, portrait: `${PORTRAITS}/mafia-informant.webp`,
    displayName: t('Мафийн мэдээлэгч', 'Mafia Informant'),
    description: t('Мафийн талд нууцаар ажилладаг мэдээлэгч.', 'An informant secretly working for the Mafia.'),
    ability: t('Мафийн гишүүд хэн болохыг та мэднэ, харин тэд таныг мэдэхгүй. Өдөр иргэдийг төөрөгдүүлж мафид нууцаар тусална. Бүх мафийн гишүүн хасагдвал та шөнийн довтолгоог өвлөн авна.', 'You know who the Mafia are, but they don’t know you. By day, mislead the town and help them in secret. If every Mafia member is out, you take over the night attacks.'),
    cardText: t('Мафийг мэддэг ч тэд таныг мэдэхгүй. Иргэдийг төөрөгдүүлж, мафид нууцаар тусал.', 'You know the Mafia, but they don’t know you. Mislead the town and help them in secret.'),
  },
  {
    id: 'shotgun-grandmother', name: 'Old Lady with Shotgun', faction: 'citizens', team: 'town', icon: Crosshair, portrait: `${PORTRAITS}/shotgun-grandmother.webp`,
    displayName: t('Буутай эмээ', 'Shotgun Granny'),
    description: t('Иргэдийн багийн зэвсэгтэй хамгаалагч.', 'The town’s armed guardian.'),
    ability: t('Мафи таныг анх удаа онилон довтлоход та хамгаалалтгүй байсан бол буугаар хариу буудаж, халдагчийг тоглоомоос хасна. Буу ганцхан удаа буудна, дараагийн довтолгоонд та хамгаалалтгүй үлдэнэ.', 'The first time the Mafia attack you while you are unprotected, you shoot back and take the attacker out of the game. The shotgun fires only once; after that you are unprotected.'),
    cardText: t('Мафи анх удаа танд довтлоход хамгаалалтгүй байвал буугаараа хариу буудаж, халдагчийг хасна. Ганц удаа.', 'The first time the Mafia attack you unprotected, your shotgun takes the attacker down. One shot only.'),
  },
  {
    id: 'jester', name: 'Jester', faction: 'neutral', team: 'wildcard', icon: Drama, portrait: `${PORTRAITS}/jester.webp`,
    displayName: t('Алиа', 'Jester'),
    description: t('Аль ч багт харьяалагдахгүй тоглоомчин.', 'A trickster who belongs to no side.'),
    ability: t('Таны цорын ганц зорилго бол өдрийн шүүх хурлаар гэмтэй гэж хасагдах. Тэгвэл та ганцаараа ялна. Шөнө алагдах эсвэл тоглоом өөрөөр дуусвал ялагдана.', 'Your only goal is to be found guilty and voted out in a daytime trial. Then you win alone. If you die at night or the game ends any other way, you lose.'),
    cardText: t('Өдрийн шүүх хурлаар гэмтэй гэж хасагдвал ганцаараа ялна.', 'Get voted out as guilty in a daytime trial and you win alone.'),
  },
  {
    id: 'citizen', name: 'Citizen', faction: 'citizens', team: 'town', icon: Users, portrait: `${PORTRAITS}/citizen.webp`,
    displayName: t('Энгийн иргэн', 'Citizen'),
    description: t('Хотын нууцын дунд сэжүүрээр дүгнэлт хийдэг жирийн иргэн.', 'An ordinary citizen who reads the clues among the city’s secrets.'),
    ability: t('Танд тусгай шөнийн чадвар байхгүй. Хэлэлцүүлэгт оролцож, сэжүүрүүдийг шинжилж, санал хураалтаар мафийн гишүүдийг илрүүлэхэд тусална.', 'You have no night ability. Join the discussion, study the clues and help vote the Mafia out.'),
    cardText: t('Шөнийн чадваргүй. Ярилцаж, сэжүүр шинжилж, саналаараа мафийг ил гарга.', 'No night ability. Talk, weigh the clues and vote the Mafia out.'),
  },
];
/** Short names for compact role lists (lobby rules, results). */
export const SHORT_ROLE_NAMES: Record<RoleName, string> = {
  Mafia: t('Мафи', 'Mafioso'), Don: t('Дон', 'Don'), Doctor: t('Эмч', 'Doctor'), Detective: t('Цагдаа', 'Detective'), Bodyguard: t('Бие хамгаалагч', 'Bodyguard'),
  'Good Informant': t('Сайн мэдээлэгч', 'Informant'), 'Bad Informant': t('Мафийн мэдээлэгч', 'Mafia Informant'), 'Old Lady with Shotgun': t('Буутай эмээ', 'Shotgun Granny'),
  Jester: t('Алиа', 'Jester'), Citizen: t('Иргэн', 'Citizen'),
};

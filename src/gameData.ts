import {
  Crosshair, Crown, Drama, Eye, Fingerprint, HeartPulse, Radio, Shield, ShieldHalf, Skull, Users,
} from 'lucide-react';

import type { RoleName } from './gameEngine';
export type { RoleName };

export type Role = {
  id: string;
  name: RoleName;
  displayName: string;
  faction: 'citizens' | 'mafia' | 'neutral';
  description: string;
  ability: string;
  cardImage: string;
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

export const roles: Role[] = [
  { id: 'mafia-member', name: 'Mafia', displayName: 'Мафийн гишүүн', faction: 'mafia', description: 'Мафийн бүлгийн нууц гишүүн.', ability: 'Шөнө нэг тоглогчийг онилж, багийн довтолгоог сонгоно.', cardImage: '/assets/cards/mafiin-tuluulugch.jpg', team: 'mafia', icon: Skull },
  { id: 'don', name: 'Don', displayName: 'Дон', faction: 'mafia', description: 'Мафийн толгойлогч.', ability: 'Мафийн гишүүдтэй хамт шөнө довтолно. Гишүүд өөр өөр хүн сонговол таны сонголт эцсийнх. Цагдаа таныг шалгавал «мафи биш» гэж гарна.', cardImage: '/assets/cards/don.jpg', team: 'mafia', icon: Crown },
  { id: 'police-officer', name: 'Detective', displayName: 'Цагдаа', faction: 'citizens', description: 'Иргэдийн багийн мөрдөгч.', ability: 'Шөнө бүр амьд байгаа нэг тоглогчийг шалгаж, тухайн тоглогч Мафийн бүлэгт хамаарах эсэхийг олж мэднэ. Бүх шалгалтын үр дүн таны нууц тэмдэглэлд хадгалагдана.', cardImage: '/assets/cards/mordogch.jpg', team: 'town', icon: Eye },
  { id: 'doctor', name: 'Doctor', displayName: 'Эмч', faction: 'citizens', description: 'Иргэдийн багийн эмч.', ability: 'Шөнө бүр нэг амьд тоглогчийг сонгон хамгаална. Мафийн халдлагад өртсөн бол хамгаалсан тоглогч амьд үлдэнэ. Өөрийгөө ч хамгаалж болно, гэхдээ нэг хүнийг хоёр шөнө дараалан хамгаалж болохгүй.', cardImage: '/assets/cards/emch.jpg', team: 'town', icon: HeartPulse },
  { id: 'bodyguard', name: 'Bodyguard', displayName: 'Бие хамгаалагч', faction: 'citizens', description: 'Иргэдийн багийн хамгаалагч.', ability: 'Шөнө бүр өөрөөсөө бусад нэг тоглогчийг хамгаална. Тэр хүн рүү мафи довтолбол та оронд нь амиа өгч, түүнийг аварна. Эмч түрүүлж хамгаалсан бол та амьд үлдэнэ.', cardImage: '/assets/cards/bie-khamgaalagch.jpg', team: 'town', icon: ShieldHalf },
  { id: 'good-informant', name: 'Good Informant', displayName: 'Сайн мэдээлэгч', faction: 'citizens', description: 'Мафийн тухай нууц мэдээлэл цуглуулдаг иргэн.', ability: 'Мафийн гишүүдийн хэн болохыг нууцаар мэдэж авна. Олж авсан мэдээлэл зөвхөн танд харагдана.', cardImage: '/assets/cards/sain-medeelegch.jpg', team: 'town', icon: Fingerprint },
  { id: 'mafia-informant', name: 'Bad Informant', displayName: 'Мафийн мэдээлэгч', faction: 'mafia', description: 'Мафийн талд нууцаар ажилладаг мэдээлэгч.', ability: 'Мафийн талд нууцаар тусална. Таны жинхэнэ үүргийг мафийн гишүүд автоматаар мэдэхгүй. Бүх мафийн гишүүн хасагдвал та шөнийн довтолгоог өвлөн авна.', cardImage: '/assets/cards/mafiin-medeelegch.jpg', team: 'mafia', icon: Radio },
  { id: 'shotgun-grandmother', name: 'Old Lady with Shotgun', displayName: 'Буутай эмээ', faction: 'citizens', description: 'Иргэдийн багийн зэвсэгтэй хамгаалагч.', ability: 'Мафи таныг анх удаа онилон довтлоход та хамгаалалтгүй байсан бол буугаар хариу буудаж, халдагчийг тоглоомоос хасна. Буу ганцхан удаа буудна, дараагийн довтолгоонд та хамгаалалтгүй үлдэнэ.', cardImage: '/assets/cards/buutai-emee.jpg', team: 'town', icon: Crosshair },
  { id: 'jester', name: 'Jester', displayName: 'Алиа', faction: 'neutral', description: 'Аль ч багт харьяалагдахгүй тоглоомчин.', ability: 'Таны цорын ганц зорилго бол өдрийн шүүх хурлаар гэмтэй гэж хасагдах. Тэгвэл та ганцаараа ялна. Шөнө алагдах эсвэл тоглоом өөрөөр дуусвал ялагдана.', cardImage: '/assets/cards/alia.jpg', team: 'wildcard', icon: Drama },
  { id: 'citizen', name: 'Citizen', displayName: 'Энгийн иргэн', faction: 'citizens', description: 'Хотын нууцын дунд сэжүүрээр дүгнэлт хийдэг жирийн иргэн.', ability: 'Танд тусгай шөнийн чадвар байхгүй. Хэлэлцүүлэгт оролцож, сэжүүрүүдийг шинжилж, санал хураалтаар мафийн гишүүдийг илрүүлэхэд тусална.', cardImage: '/assets/cards/civilian.jpg', team: 'town', icon: Users },
];
/** Short names for compact role lists (lobby rules, results). */
export const SHORT_ROLE_NAMES: Record<RoleName, string> = {
  Mafia: 'Мафи', Don: 'Дон', Doctor: 'Эмч', Detective: 'Цагдаа', Bodyguard: 'Бие хамгаалагч', 'Good Informant': 'Сайн мэдээлэгч',
  'Bad Informant': 'Мафийн мэдээлэгч', 'Old Lady with Shotgun': 'Буутай эмээ', Jester: 'Алиа', Citizen: 'Иргэн',
};

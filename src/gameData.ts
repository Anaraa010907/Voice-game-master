import {
  Crosshair, Eye, Fingerprint, HeartPulse, Radio, Shield, Skull, Users,
} from 'lucide-react';

import type { RoleName } from './gameEngine';
export type { RoleName };

export type Role = {
  id: string;
  name: RoleName;
  displayName: string;
  faction: 'citizens' | 'mafia';
  description: string;
  ability: string;
  team: 'town' | 'mafia' | 'wildcard';
  /** Optional painted portrait shown on the role card; without one the card shows the icon emblem. */
  portrait?: string;
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
  { id: 'mafia-member', name: 'Mafia', displayName: 'Мафийн гишүүн', faction: 'mafia', description: 'Мафийн бүлгийн нууц гишүүн.', ability: 'Шөнө нэг тоглогчийг онилж, багийн довтолгоог сонгоно.', team: 'mafia', icon: Skull, portrait: '/assets/roles/role-mafia.webp' },
  { id: 'police-officer', name: 'Detective', displayName: 'Цагдаа', faction: 'citizens', description: 'Иргэдийн багийн мөрдөгч.', ability: 'Шөнө бүр амьд байгаа нэг тоглогчийг шалгаж, тухайн тоглогч Мафийн бүлэгт хамаарах эсэхийг олж мэднэ. Бүх шалгалтын үр дүн таны нууц тэмдэглэлд хадгалагдана.', team: 'town', icon: Eye },
  { id: 'doctor', name: 'Doctor', displayName: 'Эмч', faction: 'citizens', description: 'Иргэдийн багийн эмч.', ability: 'Шөнө бүр нэг амьд тоглогчийг сонгон хамгаална. Мафийн халдлагад өртсөн бол хамгаалсан тоглогч амьд үлдэнэ. Өөрийгөө ч хамгаалж болно, гэхдээ нэг хүнийг хоёр шөнө дараалан хамгаалж болохгүй.', team: 'town', icon: HeartPulse },
  { id: 'good-informant', name: 'Good Informant', displayName: 'Сайн мэдээлэгч', faction: 'citizens', description: 'Мафийн тухай нууц мэдээлэл цуглуулдаг иргэн.', ability: 'Мафийн гишүүдийн хэн болохыг нууцаар мэдэж авна. Олж авсан мэдээлэл зөвхөн танд харагдана.', team: 'town', icon: Fingerprint },
  { id: 'mafia-informant', name: 'Bad Informant', displayName: 'Мафийн мэдээлэгч', faction: 'mafia', description: 'Мафийн талд нууцаар ажилладаг мэдээлэгч.', ability: 'Мафийн талд нууцаар тусална. Таны жинхэнэ үүргийг мафийн гишүүд автоматаар мэдэхгүй. Бүх мафийн гишүүн хасагдвал та шөнийн довтолгоог өвлөн авна.', team: 'mafia', icon: Radio },
  { id: 'shotgun-grandmother', name: 'Old Lady with Shotgun', displayName: 'Буутай эмээ', faction: 'citizens', description: 'Иргэдийн багийн зэвсэгтэй хамгаалагч.', ability: 'Мафи таныг анх удаа онилон довтлоход та хамгаалалтгүй байсан бол буугаар хариу буудаж, халдагчийг тоглоомоос хасна. Буу ганцхан удаа буудна, дараагийн довтолгоонд та хамгаалалтгүй үлдэнэ.', team: 'town', icon: Crosshair },
  { id: 'citizen', name: 'Citizen', displayName: 'Энгийн иргэн', faction: 'citizens', description: 'Хотын нууцын дунд сэжүүрээр дүгнэлт хийдэг жирийн иргэн.', ability: 'Танд тусгай шөнийн чадвар байхгүй. Хэлэлцүүлэгт оролцож, сэжүүрүүдийг шинжилж, санал хураалтаар мафийн гишүүдийг илрүүлэхэд тусална.', team: 'town', icon: Users },
];
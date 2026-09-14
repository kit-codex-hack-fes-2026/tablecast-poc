// 店舗と人物はすべて架空。権限はOAuthの表示名ではなくDBの所属で判断する。
export const tablecastDemoIdentities = [
  {
    email: "haruka.sato@komorebi-shijo.com",
    legacyEmails: ["tablecast-owner@example.test", "owner@tablecast.example"],
    name: "佐藤 晴香",
    role: "owner",
    stores: ["tablecast-komorebi", "tablecast-hanul"],
    label: "京料理こもれび四条店・韓国食堂ハヌル三条店 / オーナー (owner)",
    imageFile: "haruka-sato.webp",
  },
  {
    email: "ren.tanaka@komorebi-shijo.com",
    legacyEmails: ["tablecast-member@example.test"],
    name: "田中 蓮",
    role: "admin",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / 管理者 (admin)",
    imageFile: "ren-tanaka.webp",
  },
  {
    email: "aoi.ito@komorebi-shijo.com",
    legacyEmails: ["tablecast-komorebi-staff@example.test"],
    name: "伊藤 葵",
    role: "member",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / スタッフ (member)",
    imageFile: "aoi-ito.webp",
  },
  {
    email: "naoko.kobayashi@hanul-sanjo.com",
    legacyEmails: ["tablecast-hanul@example.test"],
    name: "小林 直子",
    role: "admin",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / 管理者 (admin)",
    imageFile: "naoko-kobayashi.webp",
  },
  {
    email: "yuma.mori@hanul-sanjo.com",
    legacyEmails: ["tablecast-hanul-staff@example.test"],
    name: "森 悠真",
    role: "member",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / スタッフ (member)",
    imageFile: "yuma-mori.webp",
  },
  {
    email: "tsubasa.yamamoto@westward-burgers-kyoto.com",
    legacyEmails: ["tablecast-koharu@example.test", "koharu@tablecast.example"],
    name: "山本 翼",
    role: "owner",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / オーナー (owner)",
    imageFile: "tsubasa-yamamoto.webp",
  },
  {
    email: "misaki.nakamura@westward-burgers-kyoto.com",
    legacyEmails: ["tablecast-koharu-admin@example.test"],
    name: "中村 美咲",
    role: "admin",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 管理者 (admin)",
    imageFile: "misaki-nakamura.webp",
  },
  {
    email: "alex.morgan@westward-burgers-kyoto.com",
    legacyEmails: ["tablecast-koharu-staff@example.test"],
    name: "Alex Morgan",
    role: "member",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / スタッフ (member)",
    imageFile: "alex-morgan.webp",
  },
] as const;

export const tablecastDemoStoreIcons: Record<string, string> = {
  "tablecast-komorebi": "komorebi-logo.webp",
  "tablecast-koharu": "westward-logo.webp",
  "tablecast-hanul": "hanul-logo.webp",
};

export const tablecastDemoLinkIdentity = {
  email: "rin.ogawa@komorebi-shijo.com",
  legacyEmails: ["tablecast-link@example.test"],
  name: "小川 凛",
  label: "未所属・連携確認 / No membership",
  imageFile: "account-link.webp",
};

// 既知の旧デモメールだけを正規化し、手動で指定したメールは保持する。
export function tablecastDemoEmail(email: string) {
  return (
    [...tablecastDemoIdentities, tablecastDemoLinkIdentity].find((person) =>
      person.legacyEmails.some((legacy) => legacy === email),
    )?.email ?? email
  );
}

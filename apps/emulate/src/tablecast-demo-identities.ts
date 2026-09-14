// 店舗と人物はすべて架空。権限はOAuthの表示名ではなくDBの所属で判断する。
export const tablecastDemoIdentities = [
  {
    email: "tablecast-owner@example.test",
    name: "佐藤 晴香",
    role: "owner",
    stores: ["tablecast-komorebi", "tablecast-hanul"],
    label: "京料理こもれび四条店・韓国食堂ハヌル三条店 / 責任者 Owner",
    imageFile: "haruka-sato.webp",
  },
  {
    email: "tablecast-member@example.test",
    name: "田中 蓮",
    role: "admin",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / 管理者 Admin",
    imageFile: "ren-tanaka.webp",
  },
  {
    email: "tablecast-komorebi-staff@example.test",
    name: "伊藤 葵",
    role: "member",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / 従業員 Staff",
    imageFile: "aoi-ito.webp",
  },
  {
    email: "tablecast-hanul@example.test",
    name: "小林 直子",
    role: "admin",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / 管理者 Admin",
    imageFile: "naoko-kobayashi.webp",
  },
  {
    email: "tablecast-hanul-staff@example.test",
    name: "森 悠真",
    role: "member",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / 従業員 Staff",
    imageFile: "yuma-mori.webp",
  },
  {
    email: "tablecast-koharu@example.test",
    name: "山本 翼",
    role: "owner",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 責任者 Owner",
    imageFile: "tsubasa-yamamoto.webp",
  },
  {
    email: "tablecast-koharu-admin@example.test",
    name: "中村 美咲",
    role: "admin",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 管理者 Admin",
    imageFile: "misaki-nakamura.webp",
  },
  {
    email: "tablecast-koharu-staff@example.test",
    name: "Alex Morgan",
    role: "member",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 従業員 Staff",
    imageFile: "alex-morgan.webp",
  },
] as const;

export const tablecastDemoStoreIcons: Record<string, string> = {
  "tablecast-komorebi": "komorebi-logo.webp",
  "tablecast-koharu": "westward-logo.webp",
  "tablecast-hanul": "hanul-logo.webp",
};

export const tablecastDemoLinkIdentity = {
  email: "tablecast-link@example.test",
  name: "連携確認用ユーザー",
  label: "未所属 / Account linking",
  imageFile: "account-link.webp",
};

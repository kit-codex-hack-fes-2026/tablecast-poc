// 店舗と人物はすべて架空。権限はOAuthの表示名ではなくDBの所属で判断する。
export const tablecastDemoIdentities = [
  {
    email: "tablecast-owner@example.test",
    name: "佐藤 晴香",
    role: "owner",
    stores: ["tablecast-komorebi", "tablecast-hanul"],
    label: "京料理こもれび四条店・韓国食堂ハヌル三条店 / 責任者 Owner",
    colour: "#526348",
    mark: "晴",
  },
  {
    email: "tablecast-member@example.test",
    name: "田中 蓮",
    role: "admin",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / 管理者 Admin",
    colour: "#796041",
    mark: "蓮",
  },
  {
    email: "tablecast-komorebi-staff@example.test",
    name: "伊藤 葵",
    role: "member",
    stores: ["tablecast-komorebi"],
    label: "京料理こもれび四条店 / 従業員 Staff",
    colour: "#687259",
    mark: "葵",
  },
  {
    email: "tablecast-hanul@example.test",
    name: "小林 直子",
    role: "admin",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / 管理者 Admin",
    colour: "#856048",
    mark: "直",
  },
  {
    email: "tablecast-hanul-staff@example.test",
    name: "森 悠真",
    role: "member",
    stores: ["tablecast-hanul"],
    label: "韓国食堂ハヌル三条店 / 従業員 Staff",
    colour: "#9B6D5A",
    mark: "悠",
  },
  {
    email: "tablecast-koharu@example.test",
    name: "山本 翼",
    role: "owner",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 責任者 Owner",
    colour: "#21726E",
    mark: "翼",
  },
  {
    email: "tablecast-koharu-admin@example.test",
    name: "中村 美咲",
    role: "admin",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 管理者 Admin",
    colour: "#BE704D",
    mark: "美",
  },
  {
    email: "tablecast-koharu-staff@example.test",
    name: "Alex Morgan",
    role: "member",
    stores: ["tablecast-koharu"],
    label: "Westward Burgers Kyoto / 従業員 Staff",
    colour: "#4E728C",
    mark: "A",
  },
] as const;

export function tablecastDemoPortrait(person: { colour: string; mark: string }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#F4EEE4"/><path d="M10 96V84c0-23 18-35 38-35s38 12 38 35v12" fill="${person.colour}"/><circle cx="48" cy="35" r="20" fill="#E9C7AB"/><path d="M27 35c-4-31 46-32 43 1-13-1-20-9-24-17-3 9-12 14-19 16" fill="#393532"/><text x="48" y="84" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#FFFFFF">${person.mark}</text></svg>`;
}

export const tablecastDemoLinkIdentity = {
  email: "tablecast-link@example.test",
  name: "連携確認用ユーザー",
  label: "未所属 / Account linking",
  colour: "#74717E",
  mark: "L",
};

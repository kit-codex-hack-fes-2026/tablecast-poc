import type { Configuration, Product } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import { seedLanguageLabels } from "./language-labels.ts";
import { seedProductDescriptions, seedSakeDescriptions } from "./product-descriptions.ts";
import { seedProductNames, seedSakeKinds, seedSakeNames } from "./product-names.ts";

type Text = Configuration["categories"][number]["text"];
const translations = ["zh-Hans", "ko"] as const;

function names(text: Text, product = false) {
  const ja = text.ja;
  const originalEnglish = resolveText(text, "en");
  const kind = seedSakeKinds.find((item) => ja.displayName.endsWith(` ${item.ja}`));
  const brand = kind ? seedSakeNames.get(ja.displayName.split(" ")[1] ?? "") : undefined;
  const entry = product ? seedProductNames.get(ja.displayName) : undefined;
  const labels = seedLanguageLabels.get(ja.displayName);
  if (!labels && !(brand && kind)) throw new Error(`seedの名称訳がありません: ${ja.displayName}`);
  if (product && !entry && !(brand && kind))
    throw new Error(`seedの商品転写がありません: ${ja.displayName}`);
  const english = {
    ...originalEnglish,
    displayName:
      brand && kind
        ? `Komorebi ${brand.en} ${kind.meaning}`
        : (entry?.meaning ?? originalEnglish.displayName),
    transliteration:
      brand && kind
        ? `Komorebi ${brand.en} ${kind.en}`
        : (entry?.en ?? originalEnglish.transliteration ?? originalEnglish.speechName),
  };
  english.speechName = english.transliteration;
  const chinese = {
    ...ja,
    displayName:
      brand && kind
        ? `こもれび ${ja.displayName.split(" ")[1]} ${kind["zh-Hans"]}`
        : (labels?.["zh-Hans"] ?? ""),
    transliteration:
      brand && kind
        ? `科莫勒比 ${brand["zh-Hans"]} ${kind.zhSound}`
        : (entry?.["zh-Hans"] ?? labels?.["zh-Hans"] ?? ""),
    description: "",
    aliases: entry ? [entry["zh-Hans"]] : [],
  };
  chinese.speechName = chinese.transliteration;
  const korean = {
    ...ja,
    displayName: brand && kind ? `코모레비 ${brand.ko} ${kind.ko}` : (labels?.ko ?? ""),
    transliteration:
      brand && kind ? `코모레비 ${brand.ko} ${kind.koSound}` : (entry?.ko ?? labels?.ko ?? ""),
    description: "",
    aliases: entry ? [entry.ko] : [],
  };
  korean.speechName = korean.transliteration;
  return {
    ...text,
    ja: { ...ja, transliteration: ja.transliteration || ja.speechName || ja.displayName },
    en: english,
    "zh-Hans": chinese,
    ko: korean,
  };
}

const allergens: Record<string, readonly [string, string]> = {
  wheat: ["小麦", "밀"],
  soya: ["大豆", "대두"],
  soy: ["大豆", "대두"],
  egg: ["鸡蛋", "달걀"],
  milk: ["乳制品", "우유"],
  fish: ["鱼", "생선"],
  crustaceans: ["甲壳类", "갑각류"],
  molluscs: ["软体动物", "연체동물"],
  sesame: ["芝麻", "참깨"],
  barley: ["大麦", "보리"],
  mustard: ["芥末", "겨자"],
  sulphites: ["亚硫酸盐", "아황산염"],
  celery: ["芹菜", "셀러리"],
  peanuts: ["花生", "땅콩"],
  nuts: ["坚果", "견과류"],
  buckwheat: ["荞麦", "메밀"],
};

function productText(product: Product) {
  const text = names(product.text, true);
  const ingredients = product.allergens.contains.map((key) => allergens[key] ?? [key, key]);
  const chineseNote = `本合成演示记录的过敏原：${ingredients.map((item) => item[0]).join("、") || "尚无记录"}。配料选择可能改变成分，制作和供餐时的交叉接触尚未确认。请向店员确认。`;
  const koreanNote = `합성 데모에 등록된 알레르기 유발 성분: ${ingredients.map((item) => item[1]).join(", ") || "등록 정보 없음"}. 선택 재료에 따라 성분이 달라질 수 있으며 조리와 제공 중 교차 접촉은 확인되지 않았습니다. 직원에게 확인해 주세요.`;
  const description = product.tags.includes("sake")
    ? seedSakeDescriptions.get(product.text.ja.displayName.split(" ")[1] ?? "")
    : seedProductDescriptions.get(product.text.ja.displayName);
  if (!description) throw new Error(`seedの商品説明訳がありません: ${product.id}`);
  text["zh-Hans"].description = description["zh-Hans"];
  text.ko.description = description.ko;
  if (product.id.startsWith("tablecast-hanul-")) {
    text["zh-Hans"].description +=
      " 以上为虚构演示登记的原料。完整调味料、选项引起的成分变化和交叉接触均未确认。清真、犹太洁食等宗教认证及纯素适用性未确认。原料名称或去除肉类不保证适用性，请咨询店员。";
    text.ko.description +=
      " 가상 데모에 등록된 원료입니다. 전체 양념, 선택 사항에 따른 성분 변화와 교차 접촉은 미확인입니다. 할랄·코셔 등 종교 인증과 비건 적합성도 미확인입니다. 재료 이름이나 고기 제거만으로 적합성을 보장하지 않으므로 직원에게 확인해 주세요.";
    if (product.tags.includes("tabletop-cooking")) {
      text["zh-Hans"].description +=
        " 桌上加热设备只能由店员操作。肉须充分煮熟，生肉用具与餐具分开。请勿触碰热锅及加热器，需要调整时请联系店员。";
      text.ko.description +=
        " 테이블 가열 기기는 직원만 조작합니다. 고기를 충분히 익히고 생고기 집게와 식사 도구를 구분합니다. 뜨거운 팬이나 가열기를 만지지 말고 조정은 직원에게 요청해 주세요.";
    }
  }
  return {
    ...product,
    text,
    modifiers: product.modifiers.map((group) => ({
      ...group,
      text: names(group.text),
      options: group.options.map((option) => ({ ...option, text: names(option.text) })),
    })),
    allergens: {
      ...product.allergens,
      note: {
        ...product.allergens.note,
        "zh-Hans": `${text["zh-Hans"].description} ${chineseNote}`,
        ko: `${text.ko.description} ${koreanNote}`,
      },
    },
  };
}

const plans: Record<string, readonly [string, string]> = {
  "日本酒とお飲み物 飲み放題": [
    "两小时指定清酒与饮品畅饮；大容量小瓶不在套餐内。",
    "지정 청주와 음료를 2시간 동안 이용할 수 있습니다. 큰 용량의 작은 병은 제외됩니다.",
  ],
  和食の食べ放題: [
    "包含下酒小菜与油炸菜肴，额外温泉蛋不包含在内。",
    "술안주와 튀김 요리가 포함됩니다. 추가 반숙 달걀은 제외됩니다.",
  ],
  京の三皿コース: [
    "每人可从生鱼片、炸鸡和毛豆中选最多三份。重复菜品每份分别计数。上菜顺序由店员安排。",
    "생선회, 닭튀김, 풋콩 중 1인당 최대 세 접시를 고르는 정액 코스입니다. 같은 요리를 반복해도 각각 한 접시로 계산합니다. 제공 순서는 직원이 안내합니다.",
  ],
  "韓国茶と果実ドリンク 飲み放題": [
    "90分钟内每人最多四杯指定茶与果汁饮品，糖分和原料信息请逐项确认。",
    "90분 동안 지정 차와 과일 음료를 1인당 최대 네 잔 이용할 수 있습니다. 당분과 원료는 각 상품에서 확인해 주세요.",
  ],
  "クラフトビールとソフトドリンク 飲み放題": [
    "90分钟内每人最多四杯指定基础容量饮品，大容量不包含在内。",
    "90분 동안 기본 용량의 지정 음료를 1인당 최대 네 잔 이용할 수 있습니다. 큰 용량은 제외됩니다.",
  ],
};

export function localizeSeedConfiguration(
  configuration: Configuration,
  storeId: string,
): Configuration {
  const cast =
    storeId === "tablecast-hanul"
      ? {
          "zh-Hans":
            "你是虚构的Hanul三条韩国食堂的接待员。逐项介绍菜肴、原料、辣度和分享份量。桌上加热设备必须由店员操作，并提醒充分加热和热器皿的风险。少辣仍可能含辣椒。宗教认证、纯素适用性和交叉接触尚未确认；不能仅凭不加肉、植物原料或无酒精名称保证安全或适用。请转交店员。",
          ko: "가상의 하눌 산조 한국 식당에서 손님을 맞이합니다. 요리, 재료, 매운 정도와 나눠 먹을 양을 하나씩 설명합니다. 테이블 가열 기기는 반드시 직원이 조작하며 충분한 가열과 뜨거운 그릇에 주의하도록 안내합니다. 덜 매워도 고추가 들어갈 수 있습니다. 종교 인증, 비건 적합성과 교차 접촉은 미확인입니다. 고기를 빼거나 식물성 재료, 무알코올이라는 이름만으로 안전과 적합성을 보장하지 않고 직원에게 연결합니다.",
        }
      : storeId === "tablecast-koharu"
        ? {
            "zh-Hans":
              "以西海岸啤酒餐吧的亲切风格接待。逐一确认汉堡必选项，同桌不同汉堡保持分行，修改对象不明时先确认。询问苦味偏好，为不饮酒的客人介绍无酒精饮品。明示加料费用和总额，明确批准后才提交订单。不能凭身份或植物基饼推断宗教或饮食适用性；原料及交叉接触不明时交给店员。品牌与配方均为合成演示。",
            ko: "서부 해안 탭룸처럼 친근하게 맞이합니다. 버거의 필수 선택을 하나씩 확인하고 같은 테이블의 다른 버거는 별도 행으로 유지하며 수정 대상이 모호하면 확인합니다. 쓴맛 취향을 묻고 술을 마시지 않는 손님에게 무알코올 음료를 안내합니다. 추가 요금과 합계를 알리고 명시적 승인 후 주문합니다. 신원이나 식물성 패티만으로 종교·식습관 적합성을 판단하지 않습니다. 미확인 재료와 교차 접촉은 직원에게 연결합니다. 브랜드와 조리법은 합성 데모입니다.",
          }
        : {
            "zh-Hans":
              "礼貌介绍日本料理和多样清酒，逐一询问香气、口味及喜好。品牌均为虚构演示。准确确认订单；原料或交叉接触不明时，不承诺安全并请店员协助。",
            ko: "일본 요리와 다양한 청주를 정중하게 소개하며 향, 맛과 취향을 하나씩 확인합니다. 브랜드는 가상 데모입니다. 주문을 정확히 확인하고 원료나 교차 접촉이 불명확하면 안전을 보장하지 않고 직원에게 안내합니다.",
          };
  const result: Configuration = {
    ...configuration,
    languages: ["ja", "en", ...translations],
    categories: configuration.categories.map((category) => ({
      ...category,
      text: names(category.text),
    })),
    products: configuration.products.map(productText),
    plans: configuration.plans.map((plan) => {
      const text = names(plan.text);
      const description = plans[plan.text.ja.displayName];
      if (!description) throw new Error(`seedのプラン訳がありません: ${plan.id}`);
      text["zh-Hans"].description = description[0];
      text.ko.description = description[1];
      return { ...plan, text };
    }),
    cast: {
      ...configuration.cast,
      instructions: { ...configuration.cast.instructions, ...cast },
      voice: { ...configuration.cast.voice, "zh-Hans": null, ko: null },
    },
  };
  return result;
}

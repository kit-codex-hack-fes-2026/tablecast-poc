// 意味訳と転写を別々に編集できる合成デモの原稿。実行時の翻訳は行わない。
const rows = `お造り三種盛り|Three kinds of sliced raw fish|Otsukuri Sanshu Mori|奥次库里 三修 莫里|오쓰쿠리 산슈 모리
鶏の唐揚げ|Japanese soy sauce fried chicken|Karaage|卡拉阿给|가라아게
枝豆|Salted green soya beans|Edamame|埃达马梅|에다마메
さけのお造り|Sliced raw salmon|Sake no Otsukuri|萨凯 诺 奥次库里|사케노 오쓰쿠리
まぐろのお造り|Sliced raw tuna|Maguro no Otsukuri|马古罗 诺 奥次库里|마구로노 오쓰쿠리
鶏もも串 三本|Three grilled chicken thigh skewers|Tori Momo Kushi Sanbon|托里 莫莫 库希 三邦|도리 모모 쿠시 산본
つくね串 二本|Two grilled chicken meatball skewers|Tsukune Kushi Nihon|次库内 库希 尼洪|쓰쿠네 쿠시 니혼
出汁巻き卵|Japanese rolled omelette with stock|Dashimaki Tamago|达希马基 塔马戈|다시마키 다마고
冷ややっこ|Chilled tofu|Hiyayakko|希亚亚科|히야얏코
季節のお漬物|Seasonal Japanese pickled vegetables|Kisetsu no Otsukemono|基塞次 诺 奥次凯莫诺|기세쓰노 오쓰케모노
居酒屋のポテトサラダ|Japanese pub-style potato salad|Izakaya no Poteto Sarada|伊扎卡亚 诺 波泰托 萨拉达|이자카야노 포테토 사라다
たたききゅうり|Smashed cucumber with sesame|Tataki Kyūri|塔塔基 丘里|다타키 규리
さばの塩焼き|Salt-grilled mackerel|Saba no Shioyaki|萨巴 诺 希奥亚基|사바노 시오야키
ほっけの開き|Grilled split Atka mackerel|Hokke no Hiraki|霍凯 诺 希拉基|홋케노 히라키
なすの田楽|Aubergine grilled with miso glaze|Nasu no Dengaku|纳斯 诺 登嘎库|나스노 덴가쿠
しいたけの炭火焼き|Charcoal-grilled shiitake mushrooms|Shītake no Sumibiyaki|希伊塔凯 诺 苏米比亚基|시이타케노 스미비야키
海老と野菜の天ぷら盛合せ|Prawn and vegetable fritter selection|Ebi to Yasai no Tempura Moriawase|埃比 托 亚赛 诺 添普拉 莫里阿瓦塞|에비토 야사이노 덴푸라 모리아와세
海老の天ぷら|Japanese prawn fritters|Ebi no Tempura|埃比 诺 添普拉|에비노 덴푸라
揚げ出し豆腐|Fried tofu in Japanese stock|Agedashi Dōfu|阿给达希 多福|아게다시 도후
肉じゃが|Japanese beef and potato stew|Nikujaga|尼库扎嘎|니쿠자가
豚の角煮|Slow-braised pork belly|Buta no Kakuni|布塔 诺 卡库尼|부타노 가쿠니
焼きおにぎり 二個|Two grilled rice balls|Yaki Onigiri Niko|亚基 奥尼吉里 尼科|야키 오니기리 니코
さけの出汁茶漬け|Salmon rice with Japanese stock|Sake no Dashi Chazuke|萨凯 诺 达希 茶祖凯|사케노 다시 차즈케
〆のかけうどん|Thick wheat noodles in broth|Shime no Kake Udon|希梅 诺 卡凯 乌冬|시메노 가케 우동
生ビール|Draught beer|Nama Bīru|纳马 比鲁|나마 비루
ハイボール|Whisky with soda water|Haibōru|海博鲁|하이보루
レモンサワー|Lemon and shōchū soda|Remon Sawā|雷蒙 萨瓦|레몬 사와
梅酒のロック|Plum liqueur on ice|Umeshu no Rokku|乌梅修 诺 罗库|우메슈노 롯쿠
芋焼酎の水割り|Sweet-potato spirit with water|Imo Shōchū no Mizuwari|伊莫 烧丘 诺 米祖瓦里|이모 쇼추노 미즈와리
烏龍茶|Oolong tea|Ūroncha|乌龙茶|우롱차
緑茶|Japanese green tea|Ryokucha|廖库茶|료쿠차
ゆずソーダ|Yuzu citrus soda|Yuzu Sōda|优祖 索达|유즈 소다
サムギョプサル 卓上焼きセット 二人前|Table-grilled pork belly set for two|Samgyeopsal|萨姆格约普萨尔|삼겹살
牛肉のプルコギ|Korean sweet-marinated beef|Bulgogi|普尔戈吉|불고기
鶏と野菜のタッカルビ|Spicy stir-fried chicken and vegetables|Dakgalbi|达克嘎尔比|닭갈비
豚肉の甘辛炒め|Sweet and spicy stir-fried pork|Jeyuk Bokkeum|杰育 波克姆|제육볶음
ゆで豚のポッサム|Boiled pork with wrapping leaves|Bossam|波萨姆|보쌈
韓国フライドチキン 五個|Korean fried chicken, five pieces|Korean Fried Chicken|科里安 弗赖德 奇肯|한국 프라이드 치킨
もちもちトッポギ|Chewy rice cakes in chilli sauce|Tteokbokki|托克波基|떡볶이
海鮮ねぎチヂミ 八切れ|Seafood and spring-onion pancake, eight pieces|Haemul Pajeon|海穆尔 帕煎|해물파전
キムチチヂミ 六切れ|Kimchi pancake, six pieces|Kimchi Jeon|金奇 煎|김치전
野菜と卵のキンパ 八切れ|Vegetable and egg seaweed rice rolls, eight pieces|Gimbap|金巴普|김밥
牛肉とナムルのビビンバ|Mixed rice with beef and seasoned vegetables|Bibimbap|比宾巴普|비빔밥
さっぱり韓国冷麺|Chilled Korean noodles|Naengmyeon|冷面|냉면
豚肉と玉ねぎのジャージャー麺|Noodles with pork and onion in black-bean sauce|Jjajangmyeon|炸酱面|짜장면
豚肉と豆腐のキムチチゲ|Kimchi stew with pork and tofu|Kimchi Jjigae|金奇 吉给|김치찌개
海鮮スンドゥブチゲ|Seafood and soft-tofu stew|Haemul Sundubu Jjigae|海穆尔 顺豆腐 吉给|해물 순두부찌개
牛骨白湯のソルロンタン|Milky beef-bone soup|Seolleongtang|索隆汤|설렁탕
牛肉と野菜のチャプチェ|Stir-fried glass noodles with beef and vegetables|Japchae|杂菜|잡채
豚肉の蒸しマンドゥ 四個|Four steamed pork dumplings|Mandu|曼杜|만두
キムチ三種盛り|Three kinds of fermented chilli vegetables|Kimchi|金奇|김치
黒糖とシナモンのホットク 二個|Two pancakes filled with brown sugar and cinnamon|Hotteok|霍托克|호떡
ハヌル 清らか焼酎|Hanul clear distilled spirit|Hanul Soju|哈努尔 索朱|하눌 소주
ハヌル ゆず焼酎|Hanul yuzu distilled spirit|Hanul Yuja Soju|哈努尔 优扎 索朱|하눌 유자 소주
ハヌル お米のマッコリ|Hanul fermented rice drink|Hanul Makgeolli|哈努尔 马克格利|하눌 막걸리
ハヌル 栗マッコリ|Hanul fermented rice drink with chestnut|Hanul Bam Makgeolli|哈努尔 巴姆 马克格利|하눌 밤 막걸리
三条ブルーラガー|Sanjo Blue lager|Sanjo Blue Lager|三条 布鲁 拉格|산조 블루 라거
ゆず茶|Yuja citrus tea|Yujacha|优扎茶|유자차
とうもろこし茶|Roasted corn tea|Oksusucha|奥克苏苏茶|옥수수차
お米の甘酒風ドリンク シッケ|Sweet non-alcoholic rice drink|Sikhye|西凯|식혜
韓国梨のソーダ|Korean pear soda|Bae Soda|贝 索达|배 소다
しょうがとシナモンのスジョンガ|Ginger and cinnamon punch|Sujeonggwa|苏正果|수정과
ウエストワード・カスタムバーガー|Westward custom burger|Westward Custom Burger|韦斯特沃德 卡斯特姆 伯格|웨스트워드 커스텀 버거
グリルチキンバーガー|Grilled chicken burger|Grilled Chicken Burger|格里尔德 奇肯 伯格|그릴드 치킨 버거
きのこと植物由来パティのバーガー|Mushroom and plant-based patty burger|Mushroom and Plant-Based Patty Burger|马什鲁姆 普兰特贝斯德 帕蒂 伯格|머시룸 앤드 플랜트 베이스드 패티 버거
シーソルトフライ|Sea-salt fries|Sea-Salt Fries|西 索尔特 弗赖斯|시 솔트 프라이즈
オニオンリング|Onion rings|Onion Rings|奥尼恩 林斯|어니언 링스
ハウスコールスロー|House coleslaw|House Coleslaw|豪斯 科尔斯洛|하우스 코울슬로
ハウスピクルス|House pickles|House Pickles|豪斯 皮克尔斯|하우스 피클스
パシフィック・ウエストコーストIPA|Pacific West Coast IPA|Pacific West Coast IPA|帕西菲克 韦斯特 科斯特 IPA|퍼시픽 웨스트 코스트 IPA
サンセット・ペールエール|Sunset pale ale|Sunset Pale Ale|桑塞特 佩尔 艾尔|선셋 페일 에일
ナイトフォール・スタウト|Nightfall stout|Nightfall Stout|奈特福尔 斯陶特|나이트폴 스타우트`;

export const seedProductNames = new Map(
  rows.split("\n").map((row) => {
    const [ja = "", meaning = "", en = "", zh = "", ko = ""] = row.split("|");
    return [ja, { meaning, en, "zh-Hans": zh, ko }];
  }),
);

// 銘柄の意味は訳さず、名称の読みだけを転写する。
const sakeRows = `月凪|Tsukinagi|次基纳吉|쓰키나기
雪灯|Yukiakari|优基阿卡里|유키아카리
山霞|Yamagiri|亚马吉里|야마기리
波穂|Namiho|纳米霍|나미호
宵雫|Yoishizuku|约伊希祖库|요이시즈쿠
風乃音|Kazenone|卡泽诺内|가제노네
春澪|Harumio|哈鲁米奥|하루미오
星舟|Hoshifune|霍希福内|호시후네
秋景|Akikage|阿基卡给|아키카게
朝露路|Asatsuyuji|阿萨次优吉|아사쓰유지
米蛍|Komehotaru|科梅霍塔鲁|고메호타루
笹波月|Sasanamizuki|萨萨纳米祖基|사사나미즈키
白花里|Shirohanari|希罗哈纳里|시로하나리
緑沢音|Midorisawane|米多里萨瓦内|미도리사와네
夕凪穂|Yūnagiho|优纳吉霍|유나기호
冬雲白|Fuyukumoshiro|福优库莫希罗|후유쿠모시로
蒼月路|Aotsukiji|阿奥次基吉|아오쓰키지
珠蔵夜|Tamakurayo|塔马库拉约|다마쿠라요
稲穂波|Inahonami|伊纳霍纳米|이나호나미
鶴里風|Tsurusatokaze|次鲁萨托卡泽|쓰루사토카제
水鏡穂|Mizukagamiho|米祖卡嘎米霍|미즈카가미호
絹光夜|Kinuhikariyo|基努希卡里约|기누히카리요
里乃響|Satonohibiki|萨托诺希比基|사토노히비키
暁路|Akatsukiro|阿卡次基罗|아카쓰키로
雪纏穂|Yukimatoiho|优基马托伊霍|유키마토이호
紅葉蔵音|Momijikurane|莫米吉库拉内|모미지쿠라네
空雫里|Sorashizukuri|索拉希祖库里|소라시즈쿠리
名残星|Nagoriboshi|纳戈里博希|나고리보시`;
export const seedSakeNames = new Map(
  sakeRows.split("\n").map((row) => {
    const [ja = "", en = "", zh = "", ko = ""] = row.split("|");
    return [ja, { en, "zh-Hans": zh, ko }];
  }),
);

export const seedSakeKinds = [
  {
    ja: "純米大吟醸",
    en: "Junmai Daiginjō",
    meaning: "super premium pure rice sake",
    description: "Pure rice sake brewed with rice polished to 50% or less of its original weight.",
    "zh-Hans": "特级纯米清酒",
    zhDescription: "使用精米步合50%以下的米酿造，不添加酿造酒精。",
    ko: "최고급 순미 청주",
    koDescription: "쌀을 원래 무게의 50% 이하로 도정하여 빚으며 양조 알코올을 첨가하지 않습니다.",
    zhSound: "俊迈 大吟焦",
    koSound: "준마이 다이긴조",
  },
  {
    ja: "純米吟醸",
    en: "Junmai Ginjō",
    meaning: "premium pure rice sake",
    description: "Pure rice sake brewed with rice polished to 60% or less of its original weight.",
    "zh-Hans": "高级纯米清酒",
    zhDescription: "使用精米步合60%以下的米酿造，不添加酿造酒精。",
    ko: "고급 순미 청주",
    koDescription: "쌀을 원래 무게의 60% 이하로 도정하여 빚으며 양조 알코올을 첨가하지 않습니다.",
    zhSound: "俊迈 吟焦",
    koSound: "준마이 긴조",
  },
  {
    ja: "純米酒",
    en: "Junmai-shu",
    meaning: "pure rice sake",
    description: "Sake brewed without added alcohol.",
    "zh-Hans": "纯米清酒",
    zhDescription: "不添加酿造酒精的清酒。",
    ko: "순미 청주",
    koDescription: "양조 알코올을 첨가하지 않고 빚은 청주입니다.",
    zhSound: "俊迈 修",
    koSound: "준마이슈",
  },
  {
    ja: "本醸造",
    en: "Honjōzō",
    meaning: "sake with added alcohol",
    description: "Sake brewed with a small addition of brewing alcohol.",
    "zh-Hans": "酒精添加清酒",
    zhDescription: "添加少量酿造酒精酿造的清酒。",
    ko: "알코올 첨가 청주",
    koDescription: "소량의 양조 알코올을 첨가하여 빚은 청주입니다.",
    zhSound: "洪焦佐",
    koSound: "혼조조",
  },
  {
    ja: "にごり酒",
    en: "Nigori-zake",
    meaning: "cloudy sake",
    description: "Coarsely filtered sake with a cloudy appearance.",
    "zh-Hans": "浑浊清酒",
    zhDescription: "经粗滤、外观浑浊的清酒。",
    ko: "탁한 청주",
    koDescription: "성기게 여과하여 탁한 빛을 띠는 청주입니다.",
    zhSound: "尼戈里 扎凯",
    koSound: "니고리자케",
  },
  {
    ja: "発泡清酒",
    en: "Happō Seishu",
    meaning: "sparkling sake",
    description: "Sparkling sake.",
    "zh-Hans": "起泡清酒",
    zhDescription: "带有气泡的清酒。",
    ko: "발포 청주",
    koDescription: "기포가 있는 청주입니다.",
    zhSound: "哈波 塞修",
    koSound: "핫포 세이슈",
  },
  {
    ja: "熟成酒",
    en: "Jukusei-shu",
    meaning: "aged sake",
    description: "Aged sake.",
    "zh-Hans": "熟成清酒",
    zhDescription: "经过熟成的清酒。",
    ko: "숙성 청주",
    koDescription: "숙성한 청주입니다.",
    zhSound: "朱库塞 修",
    koSound: "주쿠세이슈",
  },
] as const;

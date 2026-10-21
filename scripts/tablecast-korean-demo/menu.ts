import type { KoreanMenuItem } from "./types.ts";
import { drinks } from "./drinks.ts";
import { mains } from "./mains.ts";
import { sides } from "./sides.ts";

export const koreanDemoStoreId = "tablecast-hanul";

export const koreanDemoStoreName = "韓国食堂ハヌル三条店";

export const koreanDemoMenu: KoreanMenuItem[] = [...mains, ...sides, ...drinks];

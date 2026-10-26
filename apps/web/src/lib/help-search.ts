import { createFromSource } from "fumadocs-core/search/server";
import { helpSource } from "./help-source";

export const helpSearch = createFromSource(helpSource);

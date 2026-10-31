import { createContext } from "react";

export const ConfigurationLanguages = createContext<readonly string[]>(["ja", "en"]);

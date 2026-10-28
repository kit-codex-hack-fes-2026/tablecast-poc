import type { Configuration } from "@tablecast/api/schema";
import type { MenuSection } from "../configuration/menu-model";
import { useI18n } from "../../i18n/locale";

export function GuideContents({
  configuration,
  section,
  itemId,
}: {
  configuration: Configuration;
  itemId: string;
  section: MenuSection;
}) {
  const { t, locale } = useI18n();
  if (section !== "guides") return null;
  const guide = configuration.guides?.find((item) => item.id === itemId);
  if (!guide) return null;
  const ids = new Set(guide.productIds);
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold">{t("assistance_products")}</h2>
        <ul className="space-y-2">
          {configuration.products
            .filter((product) => ids.has(product.id))
            .map((product) => (
              <li key={product.id}>{product.text[locale].displayName}</li>
            ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("assistance_links")}</h2>
        {guide.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="block min-h-11 py-2 underline wrap-anywhere"
          >
            {link.label[locale]}
          </a>
        ))}
      </section>
    </div>
  );
}

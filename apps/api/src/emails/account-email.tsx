import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  pixelBasedPreset,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { AccountEmailContent } from "./account-content";

// WebのRadix Gray・書体・Buttonの静的な値をReact Emailでインライン化する。
const theme = {
  borderRadius: { sm: "6px", md: "8px", lg: "10px", xl: "14px", "2xl": "18px" },
  colors: {
    background: "#fcfcfc",
    card: "#ffffff",
    muted: "#f9f9f9",
    border: "#d9d9d9",
    edge: "#cecece",
    primary: "#202020",
    secondary: "#646464",
    control: "#f0f0f0",
    success: "#193b2d",
    "success-soft": "#e6f6eb",
    warning: "#4f3422",
    "warning-soft": "#fff7c2",
  },
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  },
  backgroundImage: {
    "control-sheen": "linear-gradient(to bottom, rgba(255, 255, 255, 0.15), transparent)",
    "surface-sheen": "linear-gradient(to bottom, rgba(255, 255, 255, 0.6), transparent)",
  },
  boxShadow: {
    surface: "0 2px 8px -4px #00000017, 0 12px 32px -16px #0000001f",
    control:
      "0 1px 2px #00000017, 0 3px 6px -3px #0000001f, inset 0 1px 0 rgba(255, 255, 255, 0.95)",
    dark: "0 1px 2px #0000001f, 0 4px 8px -4px #00000031, inset 0 1px 0 rgba(255, 255, 255, 0.3)",
  },
};
// WebのRoleBadgeと招待一覧のBadgeの静的な見た目。メールではflex・SVGを使わない。
const badges = {
  owner: { style: "border-border bg-primary text-card", icon: "crown-white" },
  admin: { style: "border-border bg-control text-primary", icon: "shield-check" },
  member: { style: "border-border bg-control text-primary", icon: "user-round-badge" },
  pending: { style: "border-transparent bg-warning-soft text-warning", icon: null },
  accepted: { style: "border-transparent bg-success-soft text-success", icon: null },
  rejected: { style: "border-border bg-control text-secondary", icon: null },
  canceled: { style: "border-border bg-control text-secondary", icon: null },
};
export function AccountEmail({
  title,
  sections,
  identities = [],
  icon,
  actionVariant,
  url,
  assetBaseUrl,
}: AccountEmailContent & { assetBaseUrl: string }) {
  const asset = (name: string) => `${assetBaseUrl}/${name}`;
  const outline = actionVariant === "outline";
  const action = sections.map((section) => section.action).join(" / ");
  return (
    <Html lang={sections[0]?.language ?? "ja"}>
      <Head>
        <meta name="color-scheme" content="light" />
      </Head>
      <Preview>{title}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: theme } }}>
        <Body className="m-0 bg-background font-sans text-primary">
          <Container className="max-w-[560px] px-4 py-8">
            <Section className="rounded-2xl border border-solid border-border bg-card p-6 shadow-surface">
              <Img
                src={asset("tablecast-logo.png")}
                width="160"
                alt="TableCast"
                className="mb-7 h-auto"
              />
              {identities.length > 0 && (
                <Section className="mb-6 rounded-xl border border-solid border-border bg-muted p-4">
                  {identities.map((identity, index) => (
                    <Row key={identity.kind} className={`table-fixed ${index ? "mt-4" : ""}`}>
                      <Column
                        className={`${identity.kind === "user" ? "w-14" : "w-12"} align-middle`}
                      >
                        {identity.kind === "store" && !identity.image ? (
                          <Text className="m-0 h-9 w-9 rounded-lg border border-solid border-border bg-control text-center text-base font-semibold leading-9">
                            {identity.name.slice(0, 1)}
                          </Text>
                        ) : (
                          <Img
                            src={identity.image || asset("email/user-round.png")}
                            width={identity.kind === "user" ? "44" : "36"}
                            height={identity.kind === "user" ? "44" : "36"}
                            alt=""
                            className={`border border-solid border-border bg-muted object-cover ${identity.kind === "user" ? "rounded-full" : "rounded-lg"}`}
                          />
                        )}
                      </Column>
                      <Column className="break-words align-middle">
                        <Text className="m-0 mb-1 text-xs text-secondary">{identity.label}</Text>
                        <Text className="m-0 text-base font-medium leading-6">{identity.name}</Text>
                        {identity.description && (
                          <Text className="m-0 mt-0.5 text-sm leading-5 text-secondary">
                            {identity.description}
                          </Text>
                        )}
                      </Column>
                    </Row>
                  ))}
                </Section>
              )}
              <Img src={asset(`email/${icon}.png`)} width="28" height="28" alt="" />
              {sections.map((section, index) => (
                <Section key={section.language} lang={section.language}>
                  {index > 0 && <Hr className="my-6 border-border" />}
                  <Heading as="h1" className="my-4 text-2xl font-semibold leading-8">
                    {section.title}
                  </Heading>
                  <Text className="my-4 text-base leading-[26px]">{section.message}</Text>
                  {section.details?.map((detail) => {
                    const badge = detail.badge && badges[detail.badge];
                    return (
                      <Row
                        key={detail.label}
                        className="table-fixed border-t border-solid border-border"
                      >
                        <Column className="w-[28%] py-3 pr-3 align-top">
                          <Text className="m-0 text-sm leading-5 text-secondary">
                            {detail.label}
                          </Text>
                        </Column>
                        <Column className="py-3 align-top">
                          <Text className="m-0 break-words text-sm leading-5 tabular-nums">
                            {badge ? (
                              <span
                                className={`box-border inline-block min-h-6 max-w-full rounded-lg border border-solid px-2 py-1 text-sm font-medium leading-[19.25px] ${badge.style}`}
                              >
                                {badge.icon && (
                                  <Img
                                    src={asset(`email/${badge.icon}.png`)}
                                    width="12"
                                    height="12"
                                    alt=""
                                    className="mr-1 inline-block align-middle"
                                  />
                                )}
                                {detail.value}
                              </span>
                            ) : (
                              detail.value
                            )}
                          </Text>
                        </Column>
                      </Row>
                    );
                  })}
                </Section>
              ))}
              <Section className="my-7">
                <Button
                  href={url}
                  className={`box-border min-h-12 rounded-xl border border-solid bg-clip-padding px-4 py-3 text-center text-base font-medium leading-[22px] ${outline ? "border-edge bg-card bg-surface-sheen text-primary shadow-control" : "border-primary bg-primary bg-control-sheen text-card shadow-dark"}`}
                >
                  <Img
                    src={asset(`email/${icon}${outline || icon === "google" ? "" : "-white"}.png`)}
                    width={icon === "google" ? "20" : "16"}
                    height={icon === "google" ? "20" : "16"}
                    alt=""
                    className="mr-2 inline-block align-middle"
                  />
                  <span className="align-middle">{action}</span>
                </Button>
              </Section>
              <Hr className="mt-6 mb-4 border-border" />
              {sections.map(
                (section) =>
                  section.footer && (
                    <Text
                      key={section.language}
                      lang={section.language}
                      className="my-3 text-sm leading-5 text-secondary"
                    >
                      {section.footer}
                    </Text>
                  ),
              )}
              <Link
                href={url}
                className="block break-all text-sm leading-5 text-secondary underline"
              >
                {url}
              </Link>
            </Section>
            <Text className="m-0 mt-5 text-center text-xs text-secondary">TableCast</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

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
  borderRadius: { sm: "6px", md: "8px", lg: "10px", xl: "14px" },
  colors: {
    background: "#fcfcfc",
    card: "#ffffff",
    muted: "#f9f9f9",
    border: "#e8e8e8",
    edge: "#d9d9d9",
    primary: "#202020",
    secondary: "#646464",
  },
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  },
  boxShadow: {
    surface: "0 2px 8px -4px #00000010, 0 12px 32px -16px #00000015",
    control: "0 1px 2px #00000010, inset 0 1px 0 #ffffff",
    dark: "0 1px 2px #00000018, inset 0 1px 0 #ffffff25",
  },
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
                width="166"
                height="40"
                alt="TableCast"
                className="mb-7"
              />
              {identities.length > 0 && (
                <Section className="mb-6 rounded-xl border border-solid border-border bg-muted p-4">
                  {identities.map((identity, index) => (
                    <Row key={identity.kind} className={`table-fixed ${index ? "mt-4" : ""}`}>
                      <Column className="w-14 align-middle">
                        <Img
                          src={
                            identity.image ||
                            asset(`email/${identity.kind === "store" ? "store" : "user-round"}.png`)
                          }
                          width="40"
                          height="40"
                          alt=""
                          className={`border border-solid border-border bg-[#f0f0f0] object-cover ${identity.kind === "user" ? "rounded-full" : "rounded-lg"}`}
                        />
                      </Column>
                      <Column className="break-words align-middle">
                        <Text className="m-0 mb-1 text-xs text-secondary">{identity.label}</Text>
                        <Text className="m-0 text-base font-semibold leading-6">
                          {identity.name}
                        </Text>
                        {identity.description && (
                          <Text className="m-0 mt-0.5 text-[13px] leading-5 text-secondary">
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
                  <Heading
                    as="h1"
                    className="my-4 text-2xl font-semibold leading-[34px] tracking-[-0.4px]"
                  >
                    {section.title}
                  </Heading>
                  <Text className="my-4 text-[15px] leading-[26px]">{section.message}</Text>
                  {section.details?.map((detail) => (
                    <Row
                      key={detail.label}
                      className="table-fixed border-t border-solid border-border"
                    >
                      <Column className="w-[28%] py-3 pr-3 align-top">
                        <Text className="m-0 text-[13px] leading-[22px] text-secondary">
                          {detail.label}
                        </Text>
                      </Column>
                      <Column className="py-3 align-top">
                        <Text className="m-0 break-words text-sm leading-[22px]">
                          {detail.value}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              ))}
              <Section className="my-7">
                <Button
                  href={url}
                  className={`rounded-xl border border-solid px-5 py-3.5 text-center text-base font-medium leading-[22px] ${outline ? "border-edge bg-card text-primary shadow-control" : "border-primary bg-primary text-card shadow-dark"}`}
                >
                  <Img
                    src={asset(`email/${icon}${outline ? "" : "-white"}.png`)}
                    width="16"
                    height="16"
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
                      className="my-3 text-xs leading-5 text-secondary"
                    >
                      {section.footer}
                    </Text>
                  ),
              )}
              <Link
                href={url}
                className="block break-all text-xs leading-5 text-secondary underline"
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

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export function AccountEmail({
  title,
  message,
  action,
  url,
  logoUrl,
  details = [],
  footer,
  language = "ja",
}: {
  action: string;
  details?: string[];
  footer?: string;
  language?: "en" | "ja";
  logoUrl: string;
  message: string;
  title: string;
  url: string;
}) {
  return (
    <Html lang={language}>
      <Head />
      <Preview>{title}</Preview>
      <Tailwind>
        <Body className="bg-zinc-100 font-sans text-zinc-950">
          <Container className="mx-auto my-10 rounded-2xl bg-white p-8">
            <Img src={logoUrl} width="200" height="48" alt="TableCast" />
            <Heading className="text-2xl">{title}</Heading>
            <Text className="text-base leading-7">{message}</Text>
            {details.map((detail) => (
              <Text key={detail}>{detail}</Text>
            ))}
            <Section className="my-8">
              <Button
                href={url}
                className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white"
              >
                {action}
              </Button>
            </Section>
            <Text className="text-xs text-zinc-600">{url}</Text>
            {footer && <Text className="text-sm text-zinc-600">{footer}</Text>}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

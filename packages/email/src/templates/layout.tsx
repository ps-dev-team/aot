import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

import { brand } from '../theme.js';

export type EmailLayoutProps = {
  /** The line the inbox shows next to the subject. Worth writing; it is read. */
  preview: string;
  heading: string;
  footerTagline?: string;
  children: ReactNode;
};

/**
 * The shell every email renders inside: brand band, card, footer.
 *
 * One layout rather than per-template markup, because email HTML is where
 * duplication rots fastest — a table cell that only breaks in Outlook has to be
 * fixed once, not once per template.
 */
export const EmailLayout = ({ preview, heading, footerTagline, children }: EmailLayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={card}>
          <Text style={headingStyle}>{heading}</Text>
          {children}
        </Section>
        <Hr style={rule} />
        <Text style={footer}>{footerTagline ?? 'Sent by Agent on Trial, not by a person.'}</Text>
      </Container>
    </Body>
  </Html>
);

const body = {
  backgroundColor: brand.surface,
  margin: 0,
  padding: '32px 0',
  fontFamily: "'Courier Prime', 'Courier New', monospace",
};

const container = { maxWidth: '520px', margin: '0 auto', padding: '0 16px' };

const card = {
  backgroundColor: brand.background,
  border: `2px solid ${brand.primary}`,
  borderRadius: '0',
  padding: '32px',
};

const headingStyle = {
  margin: '0 0 16px',
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  color: brand.foreground,
};

const rule = { borderColor: brand.border, margin: '24px 0 16px' };

const footer = { margin: 0, fontSize: '12px', lineHeight: '16px', color: brand.mutedForeground };

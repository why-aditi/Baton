import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font, so the page makes no requests to Google.
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

const description =
  'Baton finds the open pull requests, Jira issues and Confluence pages only a departing engineer understands, scores the knowledge risk, and hands each one to the right teammate.';

export const metadata: Metadata = {
  title: 'Baton: handovers for when engineers leave',
  description,
  openGraph: { title: 'Baton', description, type: 'website' },
  twitter: { card: 'summary', title: 'Baton', description },
};

export const viewport: Viewport = { themeColor: '#0b0d10', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

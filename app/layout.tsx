import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Caesar Finder — name it or describe it, find where to buy',
  description:
    'Name a product or describe the one you are picturing. Caesar searches the live web and shows what it is and where to buy it, with the captured price and timestamp. Free, no signup. Powered by Caesar search.',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-canvas font-body text-ink antialiased">{children}</body>
    </html>
  );
}

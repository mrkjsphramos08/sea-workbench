import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SEA Workbench — Strong Electrostatic Adsorption Research Workspace',
  description:
    'Publication-grade scientific research workspace for Strong Electrostatic Adsorption (SEA) catalyst synthesis, PZC/uptake surveys, analytical records, and reproducible A4 reporting.',
  openGraph: {
    title: 'SEA Workbench',
    description:
      'Scientific research workspace for Strong Electrostatic Adsorption (SEA) catalyst synthesis, uptake & PZC surveys, analytical management, and A4 laboratory reporting.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SEA Workbench',
    description:
      'Scientific research workspace for Strong Electrostatic Adsorption (SEA) catalyst synthesis and reproducible reporting.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body
        className="bg-[#F8F9FA] text-[#111827] font-sans antialiased selection:bg-[#0F52BA]/15 selection:text-[#0F52BA]"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

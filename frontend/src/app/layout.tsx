import type { Metadata } from 'next';

import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'FluxSwap User Terminal',
  description: 'Swap, provide liquidity, and manage LP positions in FluxSwap.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="relative min-h-screen">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),radial-gradient(circle_at_bottom_center,rgba(59,130,246,0.10),transparent_30%)]" />
            <Navbar />
            <main className="mx-auto min-h-[calc(100vh-180px)] w-full max-w-[1500px] px-0">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

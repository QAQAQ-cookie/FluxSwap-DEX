import type { Metadata } from 'next';

import { AdminShell } from '@/components/AdminShell';
import { Providers } from '@/components/Providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'FluxSwap Admin',
  description: 'Manage FluxSwap farms, reward allocation, and reward distribution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  );
}

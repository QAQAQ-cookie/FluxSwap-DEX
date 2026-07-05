import type { Metadata } from 'next';

import { AdminShell } from '@/components/AdminShell';
import { Providers } from '@/components/Providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'FluxSwap 管理端',
  description: '管理 FluxSwap 的农场、奖励分配、金库治理和代币配置。',
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

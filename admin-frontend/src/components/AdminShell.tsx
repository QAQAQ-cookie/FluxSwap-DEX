'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Coins, LayoutDashboard, ScrollText, ShieldCheck, Sprout, Vault } from 'lucide-react';

const navItems = [
  { href: '/', label: '概览', icon: LayoutDashboard },
  { href: '/farm', label: '农场管理', icon: Sprout },
  { href: '/treasury', label: '金库管理', icon: Vault },
  { href: '/tokens', label: '代币管理', icon: Coins },
  { href: '/logs', label: '操作记录', icon: ScrollText },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between gap-6 px-6">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <ShieldCheck size={21} />
            </span>
            <span>
              <span className="block text-base font-semibold text-slate-950">FluxSwap Admin</span>
              <span className="block text-xs text-slate-500">Protocol Management Console</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0">
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-6 py-8">{children}</main>
    </div>
  );
}

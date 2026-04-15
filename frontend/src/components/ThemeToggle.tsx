'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useIsClient } from '@/hooks/useIsClient';

export function ThemeToggle() {
  const mounted = useIsClient();
  const { resolvedTheme, setTheme } = useTheme();

  if (!mounted) {
    return <div className="h-10 w-10" />;
  }

  const dark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white text-gray-700 transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
      aria-label="Toggle theme"
      title="Switch theme"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

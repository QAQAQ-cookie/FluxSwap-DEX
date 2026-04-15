'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from '@/config/wagmi';
import { ThemeProvider, useTheme } from 'next-themes';
import i18n from '@/i18n';

const queryClient = new QueryClient();

function LanguageHydrator() {
  React.useEffect(() => {
    const savedLang =
      typeof window !== 'undefined' ? window.localStorage.getItem('app-lang') : null;

    if (savedLang && savedLang !== i18n.language) {
      void i18n.changeLanguage(savedLang);
    }
  }, []);

  return null;
}

function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <RainbowKitProvider theme={mounted && resolvedTheme === 'dark' ? darkTheme() : lightTheme()}>
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LanguageHydrator />
          <RainbowKitWrapper>
            {children}
          </RainbowKitWrapper>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

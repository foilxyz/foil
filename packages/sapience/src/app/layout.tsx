import { Toaster } from '@sapience/ui/components/ui/toaster';
import { Analytics } from '@vercel/analytics/react';
import type { Metadata, Viewport } from 'next';
import type React from 'react';

import '@rainbow-me/rainbowkit/styles.css';

import Providers from '~/app/providers';
import Layout from '~/components/layout';
import GlobalLoader from '~/components/shared/GlobalLoader';
import PasswordScrim from '~/components/shared/PasswordScrim';
import { LoadingProvider } from '~/lib/context/LoadingContext';
import '../styles/globals.css';

type RootLayoutProps = {
  children: React.ReactNode;
};

const APP_NAME = 'Sapience';
const APP_DESCRIPTION = 'Sapience Prediction Markets';
const LARGE_ICON_PATH = '/icons/icon-512x512.png';
const DEFAULT_OG_IMAGE = 'https://sapience.xyz/og-image.png';
const APP_URL = 'https://sapience.xyz';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  metadataBase: new URL(APP_URL),
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' },
    ],
    apple: [
      {
        url: LARGE_ICON_PATH,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
    startupImage: [LARGE_ICON_PATH],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    url: APP_URL,
    title: {
      default: APP_NAME,
      template: '%s | Sapience',
    },
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    locale: 'en_US',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Sapience Prediction Markets',
      },
    ],
  },
  twitter: {
    creator: '@sapiencexyz',
    site: '@sapiencexyz',
    card: 'summary_large_image',
    title: {
      default: APP_NAME,
      template: '%s | Sapience',
    },
    description: APP_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2C2C2E',
  viewportFit: 'cover',
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body>
        <Providers>
          <LoadingProvider>
            <PasswordScrim />
            <GlobalLoader />
            <Layout>{children}</Layout>
            <Toaster />
          </LoadingProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;

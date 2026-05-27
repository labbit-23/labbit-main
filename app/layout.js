// File: /app/layout.js

import './globals.css';
import ChakraProviderClient from './ChakraProviderClient';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import { UserProvider } from './context/UserContext'; // Adjust the import path as necessary

export const metadata = {
  title: "Labit",
  description: "Labit diagnostics workspace",
  appleWebApp: {
    capable: true,
    title: "Labit",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", type: "image/png" },
      { url: "/favicon-16x16.png", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png" }]
  }
};

export const viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes, maximum-scale=5" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <UserProvider>
          <ChakraProviderClient>
            {children}
            <PwaInstallPrompt />
          </ChakraProviderClient>
        </UserProvider>
      </body>
    </html>
  );
}

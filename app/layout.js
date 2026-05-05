// File: /app/layout.js

import './globals.css';
import ChakraProviderClient from './ChakraProviderClient';
import { UserProvider } from './context/UserContext'; // Adjust the import path as necessary
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

export const metadata = {
  title: "Labit",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", type: "image/png" },
      { url: "/favicon-16x16.png", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png" }]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes, maximum-scale=5" />
      </head>
      <body>
        <UserProvider>
          <ChakraProviderClient>
            {children}
          </ChakraProviderClient>
        </UserProvider>
      </body>
    </html>
  );
}

// File: /app/layout.js

import './globals.css';
import ChakraProviderClient from './ChakraProviderClient';
import { UserProvider } from './context/UserContext'; // Adjust the import path as necessary

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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

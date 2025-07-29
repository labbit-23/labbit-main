// app/layout.js
import './globals.css';
import ChakraProviderClient from './ChakraProviderClient';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ChakraProviderClient>
          {children}
        </ChakraProviderClient>
      </body>
    </html>
  );
}
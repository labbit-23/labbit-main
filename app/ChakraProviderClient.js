// app/ChakraProviderClient.js
'use client';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { themeObject } from './theme';

const theme = extendTheme(themeObject);

export default function ChakraProviderClient({ children }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}
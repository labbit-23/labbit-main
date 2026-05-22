// app/theme.js
// ─────────────────────────────────────────────────────────────────────────────
// THEME SWITCHING
//   1. Change :root in app/globals.css      → CSS-var consumers update
//   2. Change color scales below            → Chakra component consumers update
//   Nothing else needs touching.
// ─────────────────────────────────────────────────────────────────────────────

export const themeObject = {

  // ── Color scales ──────────────────────────────────────────────────────────
  colors: {
    primary: {
      50:  '#F1EBF5', 100: '#D8C9E3', 200: '#BFA8D1', 300: '#A687BF',
      400: '#9679B0', 500: '#8A6BA3', 600: '#6B4F82', 700: '#4A3358',
      800: '#322240', 900: '#1A1028',
    },
    secondary: { 500: '#C76A6A', 600: '#A85252' },
    // teal remapped → plum so colorScheme="teal" uses the accent
    teal: {
      50:  '#F1EBF5', 100: '#D8C9E3', 200: '#BFA8D1', 300: '#A687BF',
      400: '#9679B0', 500: '#8A6BA3', 600: '#6B4F82', 700: '#4A3358',
      800: '#322240', 900: '#1A1028',
    },
    // cool clinical grays
    gray: {
      50:  '#F6F7F8', 100: '#F1F3F4', 200: '#E9ECEE', 300: '#E6E8EB',
      400: '#D6DADE', 500: '#878D94', 600: '#525860', 700: '#3A4049',
      800: '#252A31', 900: '#15181C',
    },
    // calm success green
    green: {
      50:  '#ECF5EF', 100: '#C8E2D2', 200: '#A3D0B5', 300: '#7EBD99',
      400: '#6DB28A', 500: '#5BA37A', 600: '#4A8A64', 700: '#2F6B49',
      800: '#1E4830', 900: '#0E2518',
    },
  },

  // ── Typography ────────────────────────────────────────────────────────────
  fonts: {
    heading: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body:    `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    mono:    `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`,
  },
  fontWeights: { normal: 400, medium: 500, semibold: 600, bold: 700 },

  // ── Shape ─────────────────────────────────────────────────────────────────
  radii: {
    none: '0', sm: '6px', base: '8px', md: '10px',
    lg: '14px', xl: '18px', '2xl': '22px', '3xl': '28px', full: '9999px',
  },

  // ── Shadows ───────────────────────────────────────────────────────────────
  shadows: {
    xs:    '0 1px 1px rgba(15,20,25,0.03)',
    sm:    '0 1px 3px rgba(15,20,25,0.06), 0 1px 2px rgba(15,20,25,0.04)',
    base:  '0 2px 6px -1px rgba(15,20,25,0.07), 0 1px 3px rgba(15,20,25,0.04)',
    md:    '0 4px 10px -2px rgba(15,20,25,0.08), 0 2px 4px rgba(15,20,25,0.04)',
    lg:    '0 8px 24px -6px rgba(15,20,25,0.10), 0 3px 8px rgba(15,20,25,0.04)',
    xl:    '0 16px 40px -12px rgba(15,20,25,0.13), 0 6px 14px -4px rgba(15,20,25,0.05)',
    '2xl': '0 24px 56px -16px rgba(15,20,25,0.16), 0 8px 20px -6px rgba(15,20,25,0.06)',
    outline: '0 0 0 3px rgba(138,107,163,0.22)',
    inner:   'inset 0 2px 4px 0 rgba(15,20,25,0.06)',
    none:    'none',
  },

  // ── Global body ───────────────────────────────────────────────────────────
  styles: {
    global: {
      body: {
        bg: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
        lineHeight: '1.5',
      },
    },
  },

  // ── Component overrides ───────────────────────────────────────────────────
  // Rule: use var(--*) for every color so swapping = only changing :root CSS vars
  components: {

    // Button ─────────────────────────────────────────────────────────────────
    // NOTE: only 'ghost' and custom variants are overridden.
    // Built-in solid/outline left intact so colorScheme="red/green/blue" still works.
    Button: {
      baseStyle: {
        fontWeight: '500',
        borderRadius: 'md',
        letterSpacing: '-0.005em',
        lineHeight: '1',
        transition: 'background .12s, border-color .12s, color .12s, box-shadow .12s',
        _focusVisible: { boxShadow: 'var(--ring)', outline: 'none' },
      },
      sizes: {
        xs: { h: '24px', minW: '24px', px: '8px',  fontSize: '10px' },
        sm: { h: '30px', minW: '30px', px: '10px', fontSize: '12px', borderRadius: 'sm' },
        md: { h: '36px', minW: '36px', px: '14px', fontSize: '13px' },
        lg: { h: '44px', minW: '44px', px: '20px', fontSize: '14px' },
      },
      variants: {
        // ghost: neutral nav-style; explicit color= props still override this
        ghost: {
          bg: 'transparent',
          color: 'var(--text-3)',
          _hover:  { bg: 'var(--surface-2)', color: 'var(--text)' },
          _active: { bg: 'var(--surface-3)' },
        },
        // Custom variants — reference CSS vars so they follow theme swaps
        primary: {
          bg: 'var(--accent)',
          color: 'white',
          boxShadow: '0 1px 2px rgba(15,20,25,0.06), inset 0 -1px 0 rgba(0,0,0,0.08)',
          _hover:    { bg: 'var(--accent-strong)', _disabled: { bg: 'var(--accent)' } },
          _active:   { bg: 'var(--accent-strong)' },
          _disabled: { opacity: 0.45 },
        },
        secondary: {
          bg: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid',
          borderColor: 'var(--border-strong)',
          boxShadow: 'xs',
          _hover:  { bg: 'var(--surface-2)' },
          _active: { bg: 'var(--surface-3)' },
        },
        soft: {
          bg: 'var(--accent-soft)',
          color: 'var(--accent-ink)',
          border: '1px solid',
          borderColor: 'var(--accent-line)',
          _hover:  { bg: 'var(--accent-line)' },
          _active: { bg: 'var(--accent-line)' },
        },
      },
      defaultProps: { size: 'md' },
    },

    // Table ───────────────────────────────────────────────────────────────────
    Table: {
      defaultProps: { variant: 'simple', size: 'md' },
      variants: {
        simple: {
          th: {
            bg:             'var(--surface-2)',
            color:          'var(--text-3)',
            fontSize:       '11px',
            fontWeight:     '600',
            textTransform:  'uppercase',
            letterSpacing:  '0.05em',
            borderBottom:   '1px solid',
            borderBottomColor: 'var(--border)',
            px: '20px',
            py: '10px',
          },
          td: {
            fontSize:       '13px',
            color:          'var(--text)',
            borderBottom:   '1px solid',
            borderBottomColor: 'var(--border-soft)',
            px: '20px',
            py: '12px',
          },
          tr: {
            _last:  { td: { borderBottom: 'none' } },
            _hover: { td: { bg: 'var(--surface-2)' } },
          },
          caption: { color: 'var(--text-3)', fontSize: '12px' },
        },
      },
    },

    // Tabs ────────────────────────────────────────────────────────────────────
    Tabs: {
      defaultProps: { colorScheme: 'teal', variant: 'line' },
      baseStyle: {
        tab: {
          fontWeight: '500',
          fontSize:   '13px',
          color:      'var(--text-3)',
          borderRadius: 'sm',
          px: 3,
          py: '7px',
          _selected: { color: 'var(--accent)', fontWeight: '600' },
          _hover:    { bg: 'var(--surface-2)', color: 'var(--text)' },
        },
        tablist:  { borderColor: 'var(--border)', gap: '2px' },
        tabpanel: { px: 0, pt: 4 },
      },
    },

    // Input / Select / Textarea ───────────────────────────────────────────────
    Input: {
      defaultProps: { variant: 'outline', focusBorderColor: 'var(--accent)' },
      variants: {
        outline: {
          field: {
            bg:          'var(--surface)',
            border:      '1px solid',
            borderColor: 'var(--border)',
            borderRadius: 'md',
            fontSize:    '14px',
            height:      '40px',
            color:       'var(--text)',
            _placeholder: { color: 'var(--text-4)' },
            _hover: { borderColor: 'var(--border-strong)' },
            _focus: { borderColor: 'var(--accent)', boxShadow: 'var(--ring)', bg: 'var(--surface)' },
          },
        },
      },
    },
    Select: {
      defaultProps: { variant: 'outline', focusBorderColor: 'var(--accent)' },
      variants: {
        outline: {
          field: {
            bg:          'var(--surface)',
            border:      '1px solid',
            borderColor: 'var(--border)',
            borderRadius: 'md',
            fontSize:    '14px',
            height:      '40px',
            color:       'var(--text)',
            _hover: { borderColor: 'var(--border-strong)' },
            _focus: { borderColor: 'var(--accent)', boxShadow: 'var(--ring)' },
          },
        },
      },
    },
    Textarea: {
      defaultProps: { variant: 'outline', focusBorderColor: 'var(--accent)' },
      variants: {
        outline: {
          bg:          'var(--surface)',
          border:      '1px solid',
          borderColor: 'var(--border)',
          borderRadius: 'md',
          fontSize:    '14px',
          color:       'var(--text)',
          _placeholder: { color: 'var(--text-4)' },
          _hover: { borderColor: 'var(--border-strong)' },
          _focus: { borderColor: 'var(--accent)', boxShadow: 'var(--ring)' },
        },
      },
    },

    // Badge ───────────────────────────────────────────────────────────────────
    Badge: {
      baseStyle: {
        fontWeight:    '600',
        letterSpacing: '0.04em',
        fontSize:      '10px',
        textTransform: 'uppercase',
        borderRadius:  'full',
        px:            '9px',
        py:            '3px',
      },
    },

    // Modal ───────────────────────────────────────────────────────────────────
    Modal: {
      baseStyle: {
        dialog: {
          borderRadius: 'xl',
          boxShadow:    'xl',
          bg:           'var(--surface)',
          border:       '1px solid',
          borderColor:  'var(--border)',
        },
        header: {
          fontSize:    '15px',
          fontWeight:  '600',
          color:       'var(--text)',
          borderBottom: '1px solid',
          borderColor: 'var(--border-soft)',
          pb: 4,
        },
        body: {
          py: 5,
          color:    'var(--text)',
          fontSize: '14px',
        },
        footer: {
          borderTop:    '1px solid',
          borderColor:  'var(--border-soft)',
          bg:           'var(--surface-2)',
          borderRadius: '0 0 18px 18px',
          pt: 4,
        },
        overlay: {
          backdropFilter: 'blur(4px)',
          bg: 'rgba(21,24,28,0.45)',
        },
        closeButton: {
          color:        'var(--text-3)',
          borderRadius: 'sm',
          top: 3, right: 3,
          _hover: { bg: 'var(--surface-2)', color: 'var(--text)' },
        },
      },
    },

    // Menu ────────────────────────────────────────────────────────────────────
    Menu: {
      baseStyle: {
        list: {
          borderRadius: 'lg',
          border:       '1px solid',
          borderColor:  'var(--border)',
          boxShadow:    'lg',
          bg:           'var(--surface)',
          py:           '4px',
          minW:         '160px',
        },
        item: {
          fontSize:   '13px',
          fontWeight: '500',
          color:      'var(--text)',
          px: 3, py: '7px',
          _hover:  { bg: 'var(--surface-2)' },
          _focus:  { bg: 'var(--surface-2)' },
          _active: { bg: 'var(--surface-3)' },
        },
        groupTitle: {
          color: 'var(--text-3)', fontSize: '11px',
          fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em',
        },
        divider: { my: '4px', borderColor: 'var(--border-soft)' },
      },
    },

    // Tooltip ─────────────────────────────────────────────────────────────────
    Tooltip: {
      baseStyle: {
        bg:         'var(--text)',
        color:      'white',
        borderRadius: 'sm',
        fontSize:   '12px',
        fontWeight: '500',
        px: '8px', py: '4px',
        boxShadow: 'md',
      },
    },

    // Progress ────────────────────────────────────────────────────────────────
    Progress: {
      baseStyle: {
        track:       { bg: 'var(--surface-3)', borderRadius: 'full' },
        filledTrack: { bg: 'var(--accent)',    borderRadius: 'full' },
      },
      defaultProps: { size: 'sm', colorScheme: 'teal' },
    },

    // Heading ─────────────────────────────────────────────────────────────────
    Heading: {
      baseStyle: {
        fontWeight:    '600',
        letterSpacing: '-0.02em',
      },
    },

    // Spinner ─────────────────────────────────────────────────────────────────
    Spinner: {
      defaultProps: { color: 'var(--accent)', emptyColor: 'var(--surface-3)' },
    },

  },
};

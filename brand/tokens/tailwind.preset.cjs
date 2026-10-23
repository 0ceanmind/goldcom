// Goldcom Tailwind preset v1.0 — mirrors tokens.json (tokens.json is the source of truth).
// Usage: module.exports = { presets: [require('./brand/tokens/tailwind.preset.cjs')], ... }
module.exports = {
  theme: {
    extend: {
      colors: {
        gc: {
          amber: '#CD864B',
          gold: '#DBA761',
          ink: '#000000',
          espresso: '#3B2A1C',
          'bronze-deep': '#62422A',
          bronze: '#8A5A2B',
          bullion: '#C8943D',
          sand: '#E8CC73',
          spark: '#F2D46B',
          onyx: '#151513',
          charcoal: '#1D1D1F',
          graphite: '#2D2E2B',
          slate: '#3D3E3A',
          stone: '#9A968C',
          'stone-dark': '#6B675F',
          mist: '#E9E1CF',
          cream: '#FFF8EA',
          'gain-dark': '#3DBE84',
          'loss-dark': '#F0605D',
          'gain-light': '#1E7F52',
          'loss-light': '#C2362F',
          info: '#3AA8E8',
        },
      },
      backgroundImage: {
        'gc-bullion': 'linear-gradient(180deg, #62422A 0%, #8A6B41 38%, #D0B366 74%, #EDD175 100%)',
        'gc-gold-leaf': 'linear-gradient(135deg, #F2D46B 0%, #DBA761 55%, #CD864B 100%)',
        'gc-onyx-glow': 'radial-gradient(120% 80% at 50% 0%, #2D2E2B 0%, #151513 60%)',
      },
      fontFamily: {
        latin: ['Inter', 'SF Pro Text', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'gc-display': ['56px', { lineHeight: '64px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'gc-h1': ['40px', { lineHeight: '48px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'gc-h2': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'gc-h3': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'gc-h4': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'gc-body-lg': ['18px', { lineHeight: '28px' }],
        'gc-body': ['16px', { lineHeight: '24px' }],
        'gc-small': ['14px', { lineHeight: '20px' }],
        'gc-caption': ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
      },
      borderRadius: {
        'gc-xs': '6px', 'gc-sm': '8px', 'gc-md': '12px', 'gc-lg': '16px', 'gc-xl': '24px',
      },
      boxShadow: {
        'gc-dark-1': '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 8px rgba(0,0,0,0.40)',
        'gc-dark-2': '0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 32px rgba(0,0,0,0.55)',
        'gc-light-1': '0 1px 2px rgba(59,42,28,0.06), 0 2px 8px rgba(59,42,28,0.06)',
        'gc-light-2': '0 8px 32px rgba(59,42,28,0.12)',
        'gc-spark-glow': '0 0 0 6px rgba(242,212,107,0.14), 0 8px 24px rgba(242,212,107,0.30)',
      },
      transitionTimingFunction: {
        'gc-standard': 'cubic-bezier(0.2, 0, 0, 1)',
        'gc-enter': 'cubic-bezier(0, 0, 0, 1)',
        'gc-exit': 'cubic-bezier(0.3, 0, 1, 1)',
      },
      transitionDuration: { 'gc-fast': '120ms', 'gc-base': '200ms', 'gc-slow': '320ms' },
    },
  },
};

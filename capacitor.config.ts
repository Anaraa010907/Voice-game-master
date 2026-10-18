import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mafiashadows.game',
  appName: 'MAFIA: SHADOWS',
  webDir: 'dist',
  android: {
    androidScheme: 'https',
  },
};

export default config;
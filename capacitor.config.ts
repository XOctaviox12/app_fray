
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.frayhub.app',
  appName: 'App',
  webDir: 'www',
  plugins: {
    Camera: {
      permissions: ['photos', 'camera']
    }
  }
};
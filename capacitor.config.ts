import type { CapacitorConfig } from '@capacitor/cli';

// The StealthCam Android app is a thin native shell that loads your running
// StealthCam server (the app needs the Node server for sockets, auth and
// recordings, so it is not a standalone static bundle).
//
// >>> SET THIS to an address your PHONE can reach <<<
//   - Tailscale IP of the PC  -> works anywhere both devices are on your tailnet
//   - PC's LAN IP, same wifi   -> e.g. http://192.168.1.50:3001
// Keep the :PORT. When you host it behind HTTPS later, use the https:// URL
// and you can remove `cleartext` below.
const SERVER_URL = 'http://100.112.186.11:3001';

const config: CapacitorConfig = {
  appId: 'tech.us3rzer0.stealthcam',
  appName: 'StealthCam',
  webDir: 'www',
  server: {
    url: SERVER_URL,
    cleartext: true, // allow plain http on your home network
  },
};

export default config;

// Thin wrapper over Capacitor plugins. On the web every call falls back to a
// browser API (or does nothing), so the same build runs in both places.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';

const isNative = Capacitor.isNativePlatform();

if (isNative) {
  document.documentElement.classList.add('native');
  StatusBar.hide().catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
}

export const native = {
  isNative,

  // `pattern` is a duration in ms or a navigator.vibrate-style array.
  vibrate(pattern) {
    if (isNative) {
      const ms = Array.isArray(pattern) ? Math.max(...pattern) : pattern;
      const style = ms >= 25 ? ImpactStyle.Heavy : ms >= 12 ? ImpactStyle.Medium : ImpactStyle.Light;
      Haptics.impact({ style }).catch(() => {});
      return;
    }
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  },

  onBack(fn) {
    if (isNative) App.addListener('backButton', fn);
  },

  onBackground(fn) {
    if (isNative) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) fn();
      });
    }
  },

  exit() {
    if (isNative) App.exitApp();
  },
};

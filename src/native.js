// Thin wrapper over Capacitor plugins. On the web every call falls back to a
// browser API (or does nothing), so the same build runs in both places.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';

const REMINDER_ID = 1;

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

  // ---- daily reminder (Android only)
  canRemind: isNative,
  async enableReminders() {
    if (!isNative) return false;
    try {
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch {
      return false;
    }
  },
  // One reminder for tomorrow, at about the time the player usually plays.
  async scheduleReminder(streak) {
    if (!isNative) return;
    const at = new Date();
    at.setDate(at.getDate() + 1);
    at.setHours(Math.min(21, Math.max(9, at.getHours())), 0, 0, 0);
    const body =
      streak > 1
        ? `Your ${streak}-day streak is on the line. Today's hole is ready!`
        : "A brand new daily hole is waiting for you.";
    try {
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: REMINDER_ID,
            title: 'Pixel Golf ⛳',
            body,
            schedule: { at, allowWhileIdle: true },
            smallIcon: 'ic_stat_pixelgolf',
            iconColor: '#6CC24A',
          },
        ],
      });
    } catch {}
  },
  async cancelReminder() {
    if (!isNative) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    } catch {}
  },

  // Returns 'shared', 'copied' or 'failed'.
  async share(text) {
    try {
      if (isNative) {
        await Share.share({ text });
        return 'shared';
      }
      if (navigator.share) {
        await navigator.share({ text });
        return 'shared';
      }
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  },

  // ---- save backup in native storage (survives WebView cache clears)
  async backup(json) {
    if (!isNative) return;
    try {
      await Preferences.set({ key: 'save', value: json });
    } catch {}
  },
  async restore() {
    if (!isNative) return null;
    try {
      const { value } = await Preferences.get({ key: 'save' });
      return value;
    } catch {
      return null;
    }
  },
};

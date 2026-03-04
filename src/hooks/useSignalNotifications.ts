/**
 * useSignalNotifications - Browser Notification Hook
 * 
 * Polls the backend for new signals every 30s during market hours.
 * When new signals arrive:
 * 1. Plays a notification chime via Web Audio API (works even on background tabs)
 * 2. Shows a browser Notification popup (requires permission)
 * 3. Dispatches a custom event for toast display
 */

import { useEffect, useRef, useCallback } from 'react';

// Generate a notification chime using Web Audio API
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Pleasant two-tone chime
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.15); // C#6

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);

        // Second tone (higher, shorter)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.2); // E6
        gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime + 0.2);
        osc2.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.warn('[Notifications] Sound failed:', e);
    }
}

// Request browser notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Show browser notification
function showBrowserNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                icon: '🔔',
                tag: 'cts-signal', // Prevents duplicate notifications
                requireInteraction: false
            });
        } catch (e) {
            console.warn('[Notifications] Browser notification failed:', e);
        }
    }
}

export function useSignalNotifications(enabled: boolean = true) {
    const lastBadgeRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const checkNotifications = useCallback(async () => {
        if (!enabled) return;

        try {
            const base = (window as any).__CTS_API_BASE || '';
            if (!base) return;

            const resp = await fetch(`${base.replace(/\/$/, '')}/api/v5/signals/notifications`);
            if (!resp.ok) return;

            const data = await resp.json();
            const badge = data.badge || 0;
            const pending = data.pending || [];

            // If badge count increased, we have new notifications
            if (badge > lastBadgeRef.current && lastBadgeRef.current >= 0) {
                const newCount = badge - lastBadgeRef.current;

                // Play sound
                playNotificationSound();

                // Show browser notification
                const symbols = pending
                    .slice(0, 3)
                    .map((n: any) => n.signals?.map((s: any) => s.symbol).join(', '))
                    .filter(Boolean)
                    .join(', ');
                showBrowserNotification(
                    `🔔 ${newCount} New Signal${newCount > 1 ? 's' : ''}`,
                    symbols || 'New trading signals detected!'
                );

                // Dispatch toast event for in-app display
                window.dispatchEvent(new CustomEvent('cts:toast', {
                    detail: {
                        message: `🔔 ${newCount} new signal${newCount > 1 ? 's' : ''} detected!`,
                        kind: 'success'
                    }
                }));
            }

            lastBadgeRef.current = badge;
        } catch (e) {
            // Silently fail — don't spam console during market close
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        // Request notification permission on mount
        requestNotificationPermission();

        // Initial check
        checkNotifications();

        // Poll every 30 seconds
        intervalRef.current = setInterval(checkNotifications, 30000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, checkNotifications]);
}

export default useSignalNotifications;

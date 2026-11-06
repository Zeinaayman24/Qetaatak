import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useIntroRunning } from '@/lib/intro';
import { greetDue, greetParts, loadWebVoices, markGreeted, speakGreeting } from '@/lib/greet';

/** Says «أهلاً يا …» once a day when a signed-in person opens the app (see lib/greet.ts). Draws nothing. */
export function Greeter() {
  const { ready, profile } = useAuth();
  const playing = useIntroRunning();
  const done = useRef(false);
  const off = useRef<() => void>(() => {});
  const first = (profile?.full_name || '').split(' ')[0];

  useEffect(() => { loadWebVoices(); return () => off.current(); }, []);

  useEffect(() => {
    if (done.current || !ready || !profile) return;
    // in the phone app, speak once the opening animation has finished
    if (Platform.OS !== 'web' && playing) return;
    let cancelled = false;
    (async () => {
      if (!(await greetDue()) || cancelled) return;
      done.current = true;
      const parts = greetParts(first);
      if (Platform.OS !== 'web') { speakGreeting(parts); markGreeted(); return; }
      // browsers only allow sound inside a tap: try on each tap until the voice really starts
      const EVENTS = ['touchend', 'click', 'keydown'] as const;
      const onTap = () => speakGreeting(parts, () => { off.current(); markGreeted(); });
      EVENTS.forEach((e) => window.addEventListener(e, onTap, { capture: true }));
      off.current = () => EVENTS.forEach((e) => window.removeEventListener(e, onTap, { capture: true }));
    })();
    return () => { cancelled = true; };
  }, [ready, profile, playing, first]);

  return null;
}

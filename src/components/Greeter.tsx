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
      // browsers only allow sound inside a tap: greet on the first one
      const onTap = () => { off.current(); speakGreeting(parts); markGreeted(); };
      window.addEventListener('pointerup', onTap, { capture: true });
      window.addEventListener('keydown', onTap, { capture: true });
      off.current = () => { window.removeEventListener('pointerup', onTap, { capture: true }); window.removeEventListener('keydown', onTap, { capture: true }); };
    })();
    return () => { cancelled = true; };
  }, [ready, profile, playing, first]);

  return null;
}

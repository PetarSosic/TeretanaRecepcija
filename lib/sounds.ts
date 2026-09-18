// Doc 08 §9: three short sounds, played only after the S-03 audio unlock. Browsers block
// audio until the page has had a user gesture, which is what [Počni rad] provides.

export type SoundName = "ok" | "warning" | "alarm";

const UNLOCK_KEY = "kp-audio-unlocked";
const players = new Map<SoundName, HTMLAudioElement>();

function player(name: SoundName): HTMLAudioElement {
  let audio = players.get(name);
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`);
    audio.preload = "auto";
    players.set(name, audio);
  }
  return audio;
}

/** S-03: the overlay is shown once per browser session. */
export function isAudioUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Called from the [Počni rad] click: a silent play inside the gesture unlocks audio. */
export function unlockAudio(): void {
  for (const name of ["ok", "warning", "alarm"] as const) {
    const audio = player(name);
    audio.muted = true;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  }
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Private windows may refuse storage; the overlay then simply shows again.
  }
}

/** D-47: a sound always accompanies a visible message, never replaces it. */
export function playSound(name: SoundName): void {
  const audio = player(name);
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Not unlocked yet, or the device is muted: the dialog still says everything.
  });
}

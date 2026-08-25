/** First-run welcome state. */

const KEY = "vsa_onboarding";
const VERSION = 1;

export interface OnboardingState {
  version: number;
  seenAt: number;
  completedAt: number | null;
  skipped: boolean;
}

const EMPTY: OnboardingState = {
  version: VERSION,
  seenAt: 0,
  completedAt: null,
  skipped: false,
};

export async function loadOnboarding(): Promise<OnboardingState> {
  try {
    const data = await chrome.storage.local.get(KEY);
    const raw = data[KEY] as Partial<OnboardingState> | undefined;
    if (!raw || raw.version !== VERSION) return { ...EMPTY };
    return {
      version: VERSION,
      seenAt: Number(raw.seenAt) || 0,
      completedAt: raw.completedAt ?? null,
      skipped: Boolean(raw.skipped),
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function markOnboardingSeen(): Promise<OnboardingState> {
  const current = await loadOnboarding();
  const next: OnboardingState = {
    ...current,
    version: VERSION,
    seenAt: current.seenAt || Date.now(),
  };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function completeOnboarding(
  skipped: boolean
): Promise<OnboardingState> {
  const next: OnboardingState = {
    version: VERSION,
    seenAt: Date.now(),
    completedAt: Date.now(),
    skipped,
  };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function isOnboardingDone(s: OnboardingState): boolean {
  return Boolean(s.completedAt);
}

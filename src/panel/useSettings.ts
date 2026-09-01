import { useSyncExternalStore } from "react";

import { onSettingsChanged, settings } from "../chrome/settings";

/** Subscribes a component to the settings object. */
export function useSettings() {
  return useSyncExternalStore(onSettingsChanged, settings);
}

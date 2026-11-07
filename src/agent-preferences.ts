/** Opt-in UI preference only. Never stores a credential, connection grant or plan consent. */
export const AGENT_EDITING_PREFERENCE = "centra.agent.editing-choice";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readAgentEditingPreference(storage: PreferenceStorage): boolean | undefined {
  try {
    const value = storage.getItem(AGENT_EDITING_PREFERENCE);
    return value === "edit" ? true : value === "read" ? false : undefined;
  } catch {
    return undefined;
  }
}
export function saveAgentEditingPreference(
  storage: PreferenceStorage,
  value: boolean | undefined,
): boolean {
  try {
    if (value === undefined) storage.removeItem(AGENT_EDITING_PREFERENCE);
    else storage.setItem(AGENT_EDITING_PREFERENCE, value ? "edit" : "read");
    return true;
  } catch {
    return false;
  }
}

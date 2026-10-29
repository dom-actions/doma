import { Storage } from "@/store/Storage";

/** Safari App Store: explicit consent before sharing chat/a11y context with third-party AI. */
export const SAFARI_AI_DATA_CONSENT_KEY = "doma_safari_ai_data_consent_v1";

export const SAFARI_AI_PRIVACY_URL = "https://domactions.com/privacy";

export async function hasSafariAiDataConsent(): Promise<boolean> {
  return (await Storage.init().get(SAFARI_AI_DATA_CONSENT_KEY)) === true;
}

export async function setSafariAiDataConsent(agreed: boolean): Promise<void> {
  await Storage.init().set(SAFARI_AI_DATA_CONSENT_KEY, agreed === true);
}

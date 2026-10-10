/** Gradium flagship voice "Russell": high-energy, encouraging, American English. */
export const DEFAULT_GRADIUM_VOICE = "_6Aslh2DxfmnRLmP";

export function gradiumVoiceId() {
  return process.env.GRADIUM_VOICE_ID || DEFAULT_GRADIUM_VOICE;
}

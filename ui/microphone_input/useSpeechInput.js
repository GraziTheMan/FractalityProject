import { SpeechInput } from './speech-input.js';

export function initSpeechInput(callback) {
  const mic = new SpeechInput(callback);
  return mic;
}

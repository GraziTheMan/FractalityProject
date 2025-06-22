// 🎙️ Voice to Node Input
export function initVoiceToNode(onTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Your browser does not support voice input.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    console.log('[Voice Transcript]', transcript);
    onTranscript(transcript);
  };

  recognition.onerror = e => {
    console.error('Voice error:', e);
  };

  recognition.start();
}

export class SpeechInput {
  constructor(targetCallback = console.log) {
    this.targetCallback = targetCallback;
    this.recognition = null;
    this.active = false;
    this.transcript = '';
    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition not supported on this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        this.transcript = finalTranscript;
        this.targetCallback(finalTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
  }

  start() {
    if (!this.recognition) return;
    this.recognition.start();
    this.active = true;
  }

  stop() {
    if (!this.recognition) return;
    this.recognition.stop();
    this.active = false;
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
  }
}

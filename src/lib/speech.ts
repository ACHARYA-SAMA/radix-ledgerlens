/* Repository touch marker. */
export function startSpeech(
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): () => void {
  const Recognition =
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition;
  if (!Recognition) {
    onError(
      "Speech recognition is unavailable in this browser. Type your text below.",
    );
    onEnd();
    return () => {};
  }
  const recognition = new Recognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = (event: any) =>
    onText(
      Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(" "),
    );
  recognition.onerror = (event: any) =>
    onError(`Microphone: ${event.error}. You can type instead.`);
  recognition.onend = onEnd;
  try {
    recognition.start();
  } catch {
    onError("Could not start the microphone. Type your text below.");
    onEnd();
  }
  return () => recognition.stop();
}

import { playChime, speakAndListen } from './ttsManager';
import { isVoiceAssistantEnabledAtCurrentLocation } from './locationManager';
import { VoiceRecorder, transcribeAudio } from './audioCapture';
import { fetchWithAuth } from './api';

const globalRecorder = new VoiceRecorder();

export async function handleSpontaneousSpeech(text: string) {
  const isAllowed = await isVoiceAssistantEnabledAtCurrentLocation();
  if (!isAllowed) return;

  await playChime();
  
  // Wait a moment for chime to finish
  await new Promise(r => setTimeout(r, 600));

  speakAndListen(text, async () => {
    // Start listening for a response
    const success = await globalRecorder.startRecording(async (uri) => {
      if (!uri) return; // Silent or cancelled
      
      const { text: userSpeech } = await transcribeAudio(uri);
      if (userSpeech) {
        const cleaned = userSpeech.trim();
        if (cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned)) return;
        
        // Send to backend headlessly
        try {
          const res = await fetchWithAuth('/conversation', {
            method: 'POST',
            body: JSON.stringify({ message: cleaned, model: 'llama-3.3-70b-versatile', mode: 'general' }),
          });
          if (res.ok) {
            const data = await res.json();
            const aiResponse = data.message?.content || data.response;
            if (aiResponse) {
              // Speak the AI's response back, and listen again!
              handleSpontaneousSpeech(aiResponse);
            }
          }
        } catch (e) {
          console.error("Headless voice conversation failed", e);
        }
      }
    });
  });
}

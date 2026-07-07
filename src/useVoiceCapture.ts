import { useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { File as ExpoFile } from 'expo-file-system';
import { CONFIG } from './constants';

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceCaptureResult {
  voiceState:       VoiceState;
  errorMsg:         string | null;
  startRecording:   () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording:  () => Promise<void>;
  resetError:       () => void;
}

export function useVoiceCapture(): UseVoiceCaptureResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  async function startRecording(): Promise<void> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Microphone access denied. You can type instead.');
        setVoiceState('error');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:    true,
        playsInSilentModeIOS:  true,
        interruptionModeIOS:   InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid:     true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setVoiceState('recording');
    } catch {
      setErrorMsg('Could not start recording. You can type instead.');
      setVoiceState('error');
    }
  }

  async function stopAndTranscribe(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) { setVoiceState('idle'); return null; }

    try {
      setVoiceState('transcribing');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:    false,
        playsInSilentModeIOS:  false,
        interruptionModeIOS:   InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid:     true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      if (!uri) {
        setErrorMsg('Recording failed. You can type instead.');
        setVoiceState('error');
        return null;
      }

      const hasProxy = CONFIG.ANTHROPIC_API_URL &&
        !CONFIG.ANTHROPIC_API_URL.includes('YOUR_VERCEL');

      if (!hasProxy) {
        setErrorMsg('Voice transcription requires the Vercel API. You can type instead.');
        setVoiceState('error');
        return null;
      }

      const audioBase64 = await new ExpoFile(uri).base64();

      const transcribeUrl = CONFIG.ANTHROPIC_API_URL.replace('/classify', '/transcribe');
      const res = await fetch(transcribeUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audioBase64, mimeType: 'audio/m4a' }),
      });

      if (!res.ok) {
        setErrorMsg('Transcription failed. You can type instead.');
        setVoiceState('error');
        return null;
      }

      const data = await res.json();
      const text = (data.text as string | undefined)?.trim() ?? null;

      if (!text) {
        setErrorMsg("Didn't catch that. Try again or type below.");
        setVoiceState('error');
        return null;
      }

      setVoiceState('idle');
      return text;
    } catch {
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
      setErrorMsg('Transcription failed. You can type instead.');
      setVoiceState('error');
      return null;
    }
  }

  async function cancelRecording(): Promise<void> {
    const recording = recordingRef.current;
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
    setVoiceState('idle');
    setErrorMsg(null);
  }

  function resetError(): void {
    setVoiceState('idle');
    setErrorMsg(null);
  }

  return { voiceState, errorMsg, startRecording, stopAndTranscribe, cancelRecording, resetError };
}

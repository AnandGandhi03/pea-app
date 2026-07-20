import { useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { File as ExpoFile } from 'expo-file-system';
import { transcribeAudio } from '../services/aiService';

export type MicState = 'idle' | 'requesting' | 'recording' | 'transcribing';

export interface UseVoiceCaptureResult {
  micState:          MicState;
  startRecording:    () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording:   () => Promise<void>;
}

const PLAYBACK_MODE = {
  allowsRecordingIOS:         false,
  playsInSilentModeIOS:       false,
  interruptionModeIOS:        InterruptionModeIOS.DuckOthers,
  interruptionModeAndroid:    InterruptionModeAndroid.DuckOthers,
  shouldDuckAndroid:          true,
  staysActiveInBackground:    false,
  playThroughEarpieceAndroid: false,
};

// Errors are reported through onError (as friendly, non-alarming copy — a
// design rule) and the mic returns to idle so the user can immediately retry.
export function useVoiceCapture(onError?: (message: string) => void): UseVoiceCaptureResult {
  const [micState, setMicState] = useState<MicState>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);

  function fail(message: string): void {
    setMicState('idle');
    onError?.(message);
  }

  async function startRecording(): Promise<void> {
    try {
      setMicState('requesting');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        fail('Microphone access needed — you can also type it.');
        return;
      }

      await Audio.setAudioModeAsync({
        ...PLAYBACK_MODE,
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        interruptionModeIOS:     InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setMicState('recording');
    } catch {
      fail('Could not start recording — you can also type it.');
    }
  }

  async function stopAndTranscribe(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) { setMicState('idle'); return null; }

    try {
      setMicState('transcribing');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync(PLAYBACK_MODE);

      if (!uri) {
        fail('Recording failed — you can also type it.');
        return null;
      }

      const audioBase64 = await new ExpoFile(uri).base64();
      const result = await transcribeAudio(audioBase64, 'audio/m4a');

      if (!result.ok) {
        if (result.reason === 'no-api') {
          fail('Voice needs a connection — you can type it instead.');
        } else if (result.reason === 'empty') {
          fail("Didn't catch that — try again or type it.");
        } else {
          fail('Transcription failed — try again or type it.');
        }
        return null;
      }

      setMicState('idle');
      return result.text;
    } catch {
      recordingRef.current = null;
      await Audio.setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      fail('Transcription failed — try again or type it.');
      return null;
    }
  }

  async function cancelRecording(): Promise<void> {
    const recording = recordingRef.current;
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
    setMicState('idle');
  }

  return { micState, startRecording, stopAndTranscribe, cancelRecording };
}

import { useEffect, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { File as ExpoFile } from 'expo-file-system';
import { CONFIG } from '../config';
import { transcribeAudio } from '../services/aiService';

export type MicState = 'idle' | 'requesting' | 'recording' | 'transcribing';

export interface UseVoiceCaptureResult {
  micState:          MicState;
  startRecording:    () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording:   () => Promise<void>;
}

interface Options {
  // Friendly, non-alarming copy (a design rule) for anything that goes wrong.
  onError?: (message: string) => void;
  // Called when a recording reaches CONFIG.MAX_RECORDING_MS. The owner should
  // finish the capture exactly as if the user had released the mic.
  onMaxDuration?: () => void;
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

// After any error the mic returns to idle so the user can immediately retry.
export function useVoiceCapture({ onError, onMaxDuration }: Options = {}): UseVoiceCaptureResult {
  const [micState, setMicState] = useState<MicState>('idle');
  const recordingRef    = useRef<Audio.Recording | null>(null);
  const transcribingRef = useRef(false);
  const maxTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always call the latest callback — the timer outlives the render that set it.
  const onMaxDurationRef = useRef(onMaxDuration);
  useEffect(() => { onMaxDurationRef.current = onMaxDuration; }, [onMaxDuration]);

  function clearMaxTimer(): void {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }

  useEffect(() => clearMaxTimer, []);

  function fail(message: string): void {
    setMicState('idle');
    onError?.(message);
  }

  async function startRecording(): Promise<void> {
    if (recordingRef.current || transcribingRef.current) return;
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

      clearMaxTimer();
      maxTimerRef.current = setTimeout(() => {
        maxTimerRef.current = null;
        if (recordingRef.current) onMaxDurationRef.current?.();
      }, CONFIG.MAX_RECORDING_MS);
    } catch {
      fail('Could not start recording — you can also type it.');
    }
  }

  async function stopAndTranscribe(): Promise<string | null> {
    clearMaxTimer();
    // Claim the recording synchronously so a second call (finger release
    // racing the max-duration timer) can't stop the same recording twice.
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) {
      if (!transcribingRef.current) setMicState('idle');
      return null;
    }

    transcribingRef.current = true;
    try {
      setMicState('transcribing');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
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
        } else if (result.reason === 'limit') {
          fail('Voice is resting for now — you can type it instead.');
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
      await Audio.setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
      fail('Transcription failed — try again or type it.');
      return null;
    } finally {
      transcribingRef.current = false;
    }
  }

  async function cancelRecording(): Promise<void> {
    clearMaxTimer();
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch {}
    }
    // A transcription in flight owns the mic state; don't hide it mid-way.
    if (transcribingRef.current) return;
    await Audio.setAudioModeAsync(PLAYBACK_MODE).catch(() => {});
    setMicState('idle');
  }

  return { micState, startRecording, stopAndTranscribe, cancelRecording };
}

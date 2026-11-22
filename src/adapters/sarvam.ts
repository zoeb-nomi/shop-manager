// Speech-to-text for Telegram voice notes (M5): Sarvam AI, any Indian language, auto-detected.
// Key: SARVAM_API_KEY in .env. Returns the transcript, or undefined so the caller can ask the owner to type.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const URL = 'https://api.sarvam.ai/speech-to-text';

export async function transcribe(file: string): Promise<{ text: string; language?: string } | undefined> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return undefined;
  const form = new FormData();
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.ogg' || ext === '.oga' ? 'audio/ogg' : ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
  form.append('file', new Blob([readFileSync(file)], { type }), path.basename(file));
  form.append('model', process.env.SARVAM_STT_MODEL ?? 'saarika:v2.5');
  form.append('language_code', 'unknown');
  const res = await fetch(URL, { method: 'POST', headers: { 'api-subscription-key': key }, body: form, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { transcript?: string; language_code?: string; error?: unknown };
  if (!res.ok) {
    console.error(`[voice] Sarvam ${res.status}:`, JSON.stringify(data).slice(0, 300));
    return undefined;
  }
  const text = data.transcript?.trim();
  return text ? { text, language: data.language_code } : undefined;
}

// Text-to-speech (Sarvam bulbul): returns WAV bytes for a short line, or undefined so the caller sends text only.
export async function speak(text: string, language = 'hi-IN'): Promise<Buffer | undefined> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return undefined;
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.slice(0, 1400),
      target_language_code: language,
      model: process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3',
      ...(process.env.SARVAM_TTS_SPEAKER ? { speaker: process.env.SARVAM_TTS_SPEAKER } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { audios?: string[]; error?: unknown };
  if (!res.ok || !data.audios?.[0]) {
    console.error(`[voice] Sarvam text-to-speech ${res.status}:`, JSON.stringify(data).slice(0, 300));
    return undefined;
  }
  return Buffer.from(data.audios[0], 'base64');
}

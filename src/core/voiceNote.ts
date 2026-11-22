// A short spoken version of a message, as a Telegram voice note (OGG/Opus) plus a WAV for the web chat.
// The text-to-speech call is injected by main.ts, so src/core stays free of provider code.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

export type Speaker = (text: string, language?: string) => Promise<Buffer | undefined>;
let speaker: Speaker | undefined;
export function useSpeaker(fn: Speaker | undefined): void {
  speaker = fn;
}

const DIR = process.env.VOICE_DIR ?? 'data/creatives'; // served at /c/ by the web adapter

// Returns the files, or undefined when there is no voice (no key, provider down): the text still goes out.
export async function voiceNote(text: string, language = 'hi-IN'): Promise<{ ogg?: string; wav: string } | undefined> {
  if (!speaker) return undefined;
  try {
    const id = createHash('sha1').update(`${language}|${text}`).digest('hex').slice(0, 12);
    const wav = path.join(DIR, `voice-${id}.wav`);
    const ogg = path.join(DIR, `voice-${id}.ogg`);
    if (!existsSync(wav)) {
      const bytes = await speaker(text, language);
      if (!bytes) return undefined;
      mkdirSync(DIR, { recursive: true });
      writeFileSync(wav, bytes);
    }
    if (!existsSync(ogg)) {
      // Telegram shows a voice-note bubble only for OGG/Opus.
      await promisify(execFile)('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', ogg], { timeout: 15_000 }).catch(
        (err) => console.error('[voice] ffmpeg could not make the voice note:', (err as Error).message.split('\n')[0]),
      );
    }
    return { ogg: existsSync(ogg) ? ogg : undefined, wav };
  } catch (err) {
    console.error('[voice] voice note failed:', (err as Error).message);
    return undefined;
  }
}

// Live check for M5 voice: sends an audio file to Sarvam speech-to-text and prints the transcript.
// Usage: node --env-file=.env --import tsx scripts/voice-check.ts <file.ogg|.wav>
import { transcribe } from '../src/adapters/sarvam.ts';
const file = process.argv[2];
if (!file) throw new Error('give an audio file');
const t = Date.now();
console.log(JSON.stringify(await transcribe(file)), `${Date.now() - t} ms`);

import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      const session = await getAuthSession();
      if (!(session?.user as any)?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'mock_key_for_dev') {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: process.env.WHISPER_MODEL || 'whisper-large-v3-turbo',
      response_format: 'json',
    });

    return NextResponse.json({ text: transcription.text });
  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 });
  }
}

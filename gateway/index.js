require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const FormData = require('form-data');

const N8N_URL = process.env.N8N_URL || 'http://n8n:5678/webhook/voice-chat';
const WHISPER_URL = process.env.WHISPER_URL || 'http://stt:8000';
const TTS_URL = process.env.TTS_URL || 'http://tts:5002';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small';

const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server listening on port 8080');

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  let isSpeaking = false;
  let streamSid = null;
  let callSid = null;
  let callerNumber = null;
  
  // Audio buffering for Whisper STT with VAD (Voice Activity Detection)
  let audioBuffer = [];
  let lastAudioTime = Date.now();
  const SILENCE_THRESHOLD = 500; // 500ms of silence triggers transcription (VAD threshold)
  const MIN_AUDIO_LENGTH = 1000; // Minimum 1 second of audio before transcribing
  
  // VAD state
  let silenceTimer = null;
  let isTranscribing = false; // Prevent concurrent transcriptions

  // Function to convert mulaw buffer to WAV for Whisper
  async function convertMulawToWav(mulawBuffer) {
    return new Promise((resolve, reject) => {
      const inputStream = new PassThrough();
      inputStream.end(mulawBuffer);
      
      const outputStream = new PassThrough();
      const chunks = [];
      
      outputStream.on('data', (chunk) => chunks.push(chunk));
      outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      outputStream.on('error', reject);

      ffmpeg(inputStream)
        .inputFormat('mulaw')
        .inputOptions(['-ar', '8000', '-ac', '1'])
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000) // Whisper typically works better with 16kHz
        .format('wav')
        .pipe(outputStream);
    });
  }

  // Function to send audio buffer to Whisper for transcription
  async function transcribeAudio() {
    if (audioBuffer.length === 0 || isTranscribing) {
      return;
    }

    // Check minimum audio length
    const audioDuration = (Date.now() - lastAudioTime) + (audioBuffer.length * 20); // Approximate duration
    if (audioDuration < MIN_AUDIO_LENGTH) {
      console.log(`Audio too short (${audioDuration}ms), waiting for more...`);
      return;
    }

    isTranscribing = true;
    const bufferToTranscribe = [...audioBuffer]; // Copy buffer
    audioBuffer = []; // Clear buffer immediately to allow new audio

    try {
      // Combine all buffered audio chunks
      const combinedAudio = Buffer.concat(bufferToTranscribe);
      console.log(`Sending ${combinedAudio.length} bytes to Whisper for transcription`);
      
      // Convert mulaw to WAV
      const wavBuffer = await convertMulawToWav(combinedAudio);
      
      // Send to faster-whisper-server API
      const formData = new FormData();
      formData.append('audio_file', wavBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });
      formData.append('task', 'transcribe');
      formData.append('language', 'de'); // German
      formData.append('output', 'json');

      const response = await axios.post(`${WHISPER_URL}/asr`, formData, {
        headers: formData.getHeaders(),
        timeout: 10000,
      });

      const transcript = response.data?.text || response.data?.transcription || response.data?.result || '';
      
      if (transcript && transcript.trim().length > 0) {
        console.log(`>> USER SAID: ${transcript}`);
        
        // Send to n8n webhook
        try {
          const n8nStartTime = Date.now();
          console.log(`Sending to n8n: ${N8N_URL}`);
          const n8nResponse = await axios.post(N8N_URL, {
            transcript: transcript,
            timestamp: new Date().toISOString(),
            sessionId: callSid,
            callerNumber: callerNumber,
          }, {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 7000,
          });

          const n8nResponseTime = Date.now() - n8nStartTime;
          console.log(`n8n response time: ${n8nResponseTime}ms`);

          // Extract response text
          const responseStr = JSON.stringify(n8nResponse.data);
          if (responseStr.includes('{{ $json.text }}') || responseStr.includes('{{ $json.output }}')) {
            console.error('⚠️  n8n returned unevaluated expression!');
            return;
          }
          
          const n8nResponseData = n8nResponse.data?.response || 
                                n8nResponse.data?.text || 
                                n8nResponse.data?.output ||
                                (Array.isArray(n8nResponse.data) && n8nResponse.data[0]?.output) ||
                                (Array.isArray(n8nResponse.data) && n8nResponse.data[0]?.text) ||
                                n8nResponse.data;
          
          let responseText = typeof n8nResponseData === 'string' 
            ? n8nResponseData 
            : (n8nResponseData?.output || n8nResponseData?.text || n8nResponseData?.response || JSON.stringify(n8nResponseData));
          
          if (responseText && (responseText.includes('{{') || responseText.includes('}}'))) {
            console.error('⚠️  Response still contains unevaluated expression:', responseText);
            return;
          }
          
          if (responseText && responseText.trim().length > 0 && !responseText.includes('{{')) {
            console.log('n8n response text to speak:', responseText);
            await speakToTwilio(responseText);
          } else {
            console.warn('n8n returned empty or invalid response. Full data:', JSON.stringify(n8nResponse.data));
          }
        } catch (error) {
          console.error('Error calling n8n webhook:', error.message);
          if (error.response) {
            console.error('n8n response status:', error.response.status);
            console.error('n8n response data:', error.response.data);
          }
        }
      }
    } catch (error) {
      console.error('Error transcribing audio with Whisper:', error.message);
      if (error.response) {
        console.error('Whisper response status:', error.response.status);
        console.error('Whisper response data:', error.response.data);
      }
    } finally {
      isTranscribing = false;
    }
  }

  // VAD: Reset silence timer when new audio arrives
  function resetSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    silenceTimer = setTimeout(() => {
      if (audioBuffer.length > 0 && !isTranscribing) {
        console.log('VAD: Silence detected, transcribing buffered audio');
        transcribeAudio();
      }
    }, SILENCE_THRESHOLD);
  }

  // Function to convert WAV to mulaw for Twilio
  function convertWavToMulaw(inputBuffer) {
    return new Promise((resolve, reject) => {
      const inputStream = new PassThrough();
      inputStream.end(inputBuffer);
      
      const outputStream = new PassThrough();
      const chunks = [];
      
      outputStream.on('data', (chunk) => chunks.push(chunk));
      outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      outputStream.on('error', reject);

      ffmpeg(inputStream)
        .inputFormat('wav')
        .audioCodec('pcm_mulaw')
        .audioChannels(1)
        .audioFrequency(8000)
        .format('mulaw')
        .pipe(outputStream);
    });
  }

  // Function to generate TTS using Coqui and send to Twilio
  async function speakToTwilio(text) {
    try {
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('Cannot send TTS: WebSocket is not open (state:', ws.readyState, ')');
        isSpeaking = false;
        return;
      }

      isSpeaking = true;
      const ttsStartTime = Date.now();
      console.log('Generating TTS for:', text.substring(0, 100) + '...');

      // Call Coqui TTS API
      const ttsUrl = `${TTS_URL}/api/tts?text=${encodeURIComponent(text)}`;
      const ttsResponse = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const wavBuffer = Buffer.from(ttsResponse.data);
      console.log(`TTS generated: ${wavBuffer.length} bytes WAV`);
      
      // Convert WAV to mulaw
      const audioBuffer = await convertWavToMulaw(wavBuffer);
      const ttsGenerationTime = Date.now() - ttsStartTime;
      console.log(`TTS converted to mulaw: ${audioBuffer.length} bytes in ${ttsGenerationTime}ms`);
      
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket closed during TTS generation, cannot send audio');
        isSpeaking = false;
        return;
      }
      
      // Send audio in chunks (160 bytes = 20ms at 8kHz mulaw)
      const chunkSize = 160;
      const totalChunks = Math.ceil(audioBuffer.length / chunkSize);
      
      const base64Chunks = [];
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const binaryChunk = audioBuffer.slice(i, i + chunkSize);
        base64Chunks.push(binaryChunk.toString('base64'));
      }
      
      let chunksSent = 0;
      const sendStartTime = Date.now();
      
      for (let i = 0; i < base64Chunks.length; i++) {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn(`WebSocket closed after sending ${chunksSent}/${totalChunks} chunks`);
          break;
        }
        
        const base64Chunk = base64Chunks[i];
        
        try {
          const mediaMessage = {
            event: 'media',
            streamSid: streamSid,
            media: {
              payload: base64Chunk,
            },
          };
          
          if (!streamSid) {
            console.error('Cannot send media: streamSid is missing!');
            break;
          }
          
          ws.send(JSON.stringify(mediaMessage));
          chunksSent++;
          
          // Wait 20ms before sending next chunk (real-time streaming)
          if (i + chunkSize < audioBuffer.length) {
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        } catch (error) {
          console.error('Error sending audio chunk:', error.message);
          break;
        }
      }
      
      // Send marker event
      if (ws.readyState === WebSocket.OPEN && streamSid) {
        try {
          ws.send(JSON.stringify({
            event: 'mark',
            streamSid: streamSid,
            mark: {
              name: 'end-of-audio'
            }
          }));
        } catch (error) {
          console.error('Error sending marker:', error.message);
        }
      }

      const sendTime = Date.now() - sendStartTime;
      console.log(`TTS audio sent: ${chunksSent}/${totalChunks} chunks (${audioBuffer.length} bytes) in ${sendTime}ms`);
      isSpeaking = false;
    } catch (error) {
      console.error('Error generating TTS:', error.message);
      if (error.response) {
        console.error('TTS API response status:', error.response.status);
        console.error('TTS API response data:', error.response.data?.toString().substring(0, 200));
      }
      isSpeaking = false;
    }
  }

  // Handle messages from Twilio
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.event === 'connected') {
        console.log('Twilio connected');
      } else if (data.event === 'start') {
        console.log('Twilio stream started');
        console.log('Stream details:', JSON.stringify(data.start || {}));
        streamSid = data.start?.streamSid || data.streamSid;
        console.log('Stream SID captured:', streamSid);
        callSid = data.start?.callSid || data.start?.call?.callSid;
        callerNumber = data.start?.customParameters?.callerNumber || 
                      data.start?.customParameters?.from ||
                      data.start?.from || 
                      data.start?.call?.from ||
                      null;
        console.log('Call SID captured:', callSid);
        console.log('Caller number captured:', callerNumber);
        console.log('Custom parameters:', JSON.stringify(data.start?.customParameters || {}));
      } else if (data.event === 'media') {
        // Buffer audio chunks for Whisper with VAD
        const audioPayload = data.media?.payload;
        if (audioPayload && !isTranscribing) {
          const audioBufferChunk = Buffer.from(audioPayload, 'base64');
          audioBuffer.push(audioBufferChunk);
          lastAudioTime = Date.now();
          
          // VAD: Reset silence timer on new audio (user is speaking)
          resetSilenceTimer();
        }
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        // Clear timers
        if (silenceTimer) {
          clearTimeout(silenceTimer);
        }
        // Transcribe any remaining audio
        if (audioBuffer.length > 0 && !isTranscribing) {
          transcribeAudio();
        }
      }
    } catch (error) {
      console.error('Error processing Twilio message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    // Clear timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Clear timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
  });
});

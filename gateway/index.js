require('dotenv').config();
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const axios = require('axios');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const N8N_URL = process.env.N8N_URL || 'http://n8n:5678/webhook/voice-chat';

if (!DEEPGRAM_API_KEY) {
  console.error('DEEPGRAM_API_KEY is required');
  process.exit(1);
}

const deepgram = createClient(DEEPGRAM_API_KEY);

const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server listening on port 8080');

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  let deepgramLive = null;
  let isSpeaking = false;
  let currentTranscript = '';
  let streamSid = null; // Store Twilio stream SID for outgoing messages
  let callSid = null;      // Store Twilio Call SID for session tracking
  let callerNumber = null; // Store caller's phone number

  // Initialize Deepgram Live Client - Optimized for Phone Calls
  // Support for Nova models (nova-2, nova-3, nova-2-phonecall) and Whisper models (whisper-small, whisper-tiny, etc.)
  const sttModel = process.env.DEEPGRAM_STT_MODEL || 'nova-2';
  const sttLanguage = process.env.DEEPGRAM_STT_LANGUAGE || 'de';
  
  // Build configuration object
  const config = {
    model: sttModel,
    encoding: 'mulaw',
    sample_rate: 8000,
    endpointing: 200,            // Faster response (200ms silence = end of turn)
    utterance_end_ms: 1000,      // Force end if silence is long
    interim_results: true,
    punctuate: true,
  };
  
  // Only add language parameter for Nova models (Whisper is multilingual by default)
  if (!sttModel.startsWith('whisper')) {
    config.language = sttLanguage;
  }
  
  deepgramLive = deepgram.listen.live(config);

  deepgramLive.on('open', () => {
    console.log('Deepgram connection opened');
  });

  deepgramLive.on('error', (error) => {
    console.error('Deepgram error:', error);
  });

  deepgramLive.on('warning', (warning) => {
    console.warn('Deepgram warning:', warning);
  });

  deepgramLive.on(LiveTranscriptionEvents.Metadata, (metadata) => {
    console.log('Deepgram metadata:', JSON.stringify(metadata).substring(0, 200));
  });

  // Listen for other events for debugging
  deepgramLive.on(LiveTranscriptionEvents.SpeechStarted, (data) => {
    console.log('Speech started detected');
  });

  deepgramLive.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
    console.log('Utterance ended');
  });

  // Listen for transcript events - Deepgram SDK uses "Results" event name
  deepgramLive.on(LiveTranscriptionEvents.Transcript, async (data) => {
    console.log('=== TRANSCRIPT EVENT RECEIVED ===');
    console.log('Data type:', typeof data);
    console.log('Data preview:', typeof data === 'string' ? data.substring(0, 300) : JSON.stringify(data).substring(0, 300));
    try {
      // Handle both string and object formats
      const transcript = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (transcript.channel?.alternatives?.[0]?.transcript) {
        const text = transcript.channel.alternatives[0].transcript;
        const isFinal = transcript.is_final === true;
        
        // DEBUG: Log ALL transcripts (partial and final)
        if (text && text.trim().length > 0) {
          console.log(`[${isFinal ? 'FINAL' : 'PARTIAL'}] Hearing: "${text}"`);
        }
        
        if (isFinal && text.trim()) {
          console.log(`>> USER SAID (FINAL): ${text}`);
          currentTranscript = text;
          
          // Send to n8n webhook
          try {
            const n8nStartTime = Date.now();
            console.log(`Sending to n8n: ${N8N_URL}`);
            const response = await axios.post(N8N_URL, {
              transcript: text,
              timestamp: new Date().toISOString(),
              sessionId: callSid,        // Use Call SID as session ID
              callerNumber: callerNumber, // Include caller's phone number
            }, {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 7000, // Reduced from 10000ms for faster failure detection
            });

            const n8nResponseTime = Date.now() - n8nStartTime;
            console.log(`n8n response time: ${n8nResponseTime}ms`);

            // Log the full response for debugging (only if DEBUG mode)
            if (process.env.DEBUG) {
              console.log('n8n full response data:', JSON.stringify(response.data).substring(0, 500));
            }
            
            // Check if n8n returned an unevaluated expression (common n8n configuration error)
            const responseStr = JSON.stringify(response.data);
            if (responseStr.includes('{{ $json.text }}') || responseStr.includes('{{ $json.output }}')) {
              console.error('⚠️  n8n returned unevaluated expression!');
              console.error('The "Respond to Webhook" node is not evaluating the expression.');
              console.error('Fix: In n8n workflow, change "Respond to Webhook" node response body to:');
              console.error('  {"response": "{{ $json.output }}"}');
              console.error('Or use: {{ $json.output }} directly as the response body.');
              return;
            }
            
            // Try multiple possible response formats
            const n8nResponse = response.data?.response || 
                              response.data?.text || 
                              response.data?.output ||
                              (Array.isArray(response.data) && response.data[0]?.output) ||
                              (Array.isArray(response.data) && response.data[0]?.text) ||
                              response.data;
            
            // Extract text if it's an object
            let responseText = typeof n8nResponse === 'string' 
              ? n8nResponse 
              : (n8nResponse?.output || n8nResponse?.text || n8nResponse?.response || JSON.stringify(n8nResponse));
            
            // Remove any remaining expression markers
            if (responseText && (responseText.includes('{{') || responseText.includes('}}'))) {
              console.error('⚠️  Response still contains unevaluated expression:', responseText);
              return;
            }
            
            if (responseText && responseText.trim().length > 0 && !responseText.includes('{{')) {
              console.log('n8n response text to speak:', responseText);
              await speakToTwilio(responseText);
            } else {
              console.warn('n8n returned empty or invalid response. Full data:', JSON.stringify(response.data));
            }
          } catch (error) {
            console.error('Error calling n8n webhook:', error.message);
            if (error.response) {
              console.error('n8n response status:', error.response.status);
              console.error('n8n response data:', error.response.data);
            }
          }
        } else if (!isFinal && text.trim()) {
          // Barge-in: If user speaks while bot is speaking, stop audio
          if (isSpeaking) {
            console.log('Barge-in detected, stopping audio');
            ws.send(JSON.stringify({ event: 'clear' }));
            isSpeaking = false;
          }
        }
      } else {
        // Log when transcript structure is unexpected
        console.log('Transcript received but no text:', JSON.stringify(transcript).substring(0, 200));
      }
    } catch (error) {
      console.error('Error processing transcript:', error);
      console.error('Raw data:', typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200));
    }
  });

  // Function to generate TTS and send to Twilio
  async function speakToTwilio(text) {
    try {
      // Check WebSocket state before starting
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('Cannot send TTS: WebSocket is not open (state:', ws.readyState, ')');
        isSpeaking = false;
        return;
      }

      isSpeaking = true;
      const ttsStartTime = Date.now();
      console.log('Generating TTS for:', text.substring(0, 100) + '...');

      const response = await axios.post(
        'https://api.deepgram.com/v1/speak',
        text,
        {
          params: {
            model: process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en',
            encoding: 'mulaw',
            sample_rate: 8000,
            container: 'none',
          },
          headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'text/plain',
          },
          responseType: 'arraybuffer',
          timeout: 15000, // Reduced from 30000ms for faster failure detection
        }
      );

      const audioBuffer = Buffer.from(response.data);
      const ttsGenerationTime = Date.now() - ttsStartTime;
      console.log(`TTS generated: ${audioBuffer.length} bytes in ${ttsGenerationTime}ms`);
      
      // Check WebSocket state again after TTS generation (it might have closed during generation)
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket closed during TTS generation, cannot send audio');
        isSpeaking = false;
        return;
      }
      
      // For Twilio Media Streams, we need to send audio in chunks (160 bytes = 20ms at 8kHz mulaw)
      // IMPORTANT: Chunk the binary data FIRST, then encode each chunk to base64
      const chunkSize = 160; // 20ms chunks for mulaw at 8kHz
      const totalChunks = Math.ceil(audioBuffer.length / chunkSize);
      
      // Pre-encode all chunks to base64 (optimization: do encoding upfront)
      const base64Chunks = [];
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const binaryChunk = audioBuffer.slice(i, i + chunkSize);
        base64Chunks.push(binaryChunk.toString('base64'));
      }
      
      let chunksSent = 0;
      const sendStartTime = Date.now();
      
      // Send chunks with 20ms delay between each (real-time streaming)
      for (let i = 0; i < base64Chunks.length; i++) {
        // Check if WebSocket is still open before each chunk
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn(`WebSocket closed after sending ${chunksSent}/${totalChunks} chunks`);
          break;
        }
        
        const base64Chunk = base64Chunks[i];
        
        // Send media event to Twilio - MUST include streamSid
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
      
      // Send a marker event to indicate end of audio (optional but helpful)
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
        // Capture streamSid from the start event - required for all outgoing messages
        streamSid = data.start?.streamSid || data.streamSid;
        console.log('Stream SID captured:', streamSid);
        // Capture Call SID and caller number for session tracking
        callSid = data.start?.callSid || data.start?.call?.callSid;
        // Try multiple possible locations for caller number
        // Note: Media Streams don't include phone numbers by default
        // Pass it via customParameters in Twilio Media Stream setup, or fetch via Twilio API using callSid
        callerNumber = data.start?.customParameters?.callerNumber || 
                      data.start?.customParameters?.from ||
                      data.start?.from || 
                      data.start?.call?.from ||
                      null;
        console.log('Call SID captured:', callSid);
        console.log('Caller number captured:', callerNumber);
        console.log('Custom parameters:', JSON.stringify(data.start?.customParameters || {}));
      } else if (data.event === 'media') {
        // Decode base64 audio and send to Deepgram
        const audioPayload = data.media?.payload;
        if (audioPayload && deepgramLive) {
          const audioBuffer = Buffer.from(audioPayload, 'base64');
          console.log(`Received audio chunk: ${audioBuffer.length} bytes, sending to Deepgram...`);
          try {
            deepgramLive.send(audioBuffer);
          } catch (err) {
            console.error('Error sending to Deepgram:', err.message);
          }
        } else {
          if (!audioPayload) {
            console.warn('Media event received but missing payload');
          }
          if (!deepgramLive) {
            console.warn('Media event received but Deepgram not ready');
          }
        }
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        if (deepgramLive) {
          deepgramLive.finish();
        }
      }
    } catch (error) {
      console.error('Error processing Twilio message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });
});


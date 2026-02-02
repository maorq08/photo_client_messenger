import { useState, useEffect, useRef } from 'react';
import type { Client, Settings, Message } from '../types';
import { createMessage, generateResponse, improveMessage, checkAIStatus, transcribeAudio } from '../api';
import './MessageInput.css';

interface Props {
  client: Client;
  settings: Settings | null;
  onMessageAdded: (message: Message) => void;
}

export default function MessageInput({ client, settings, onMessageAdded }: Props) {
  const [messageText, setMessageText] = useState('');
  const [senderMode, setSenderMode] = useState<'client' | 'me'>('client');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const toastTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    checkAIStatus().then(available => {
      if (mountedRef.current) {
        setAiAvailable(available);
      }
    });
    return () => {
      mountedRef.current = false;
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  function showToast(message: string) {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setToast(null);
      }
    }, 2500);
  }

  function handleToggle(mode: 'client' | 'me') {
    if (mode === senderMode) return;

    // Haptic feedback on mobile
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    setSenderMode(mode);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text');

    // Heuristics for "this is from client"
    const clientPatterns = [
      /^(hey|hi|hello|good morning|good afternoon)/i,
      /\?$/,                                    // Ends with question
      /when|how much|do you|are you|can you/i,  // Common client phrases
      /available|booking|price|rate|cost/i,     // Inquiry words
    ];

    // Heuristics for "this is my response"
    const mePatterns = [
      /thanks for reaching out/i,
      /I'd love to|I would love to/i,
      /my rate|my pricing|my availability/i,
      /looking forward/i,
    ];

    const clientScore = clientPatterns.filter(r => r.test(text)).length;
    const meScore = mePatterns.filter(r => r.test(text)).length;

    if (clientScore > meScore && senderMode !== 'client') {
      setSenderMode('client');
      showToast(`Looks like this is from ${client.name}`);
    } else if (meScore > clientScore && senderMode !== 'me') {
      setSenderMode('me');
      showToast('Switched to your response');
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Try to use a format Claude supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];

          if (!mountedRef.current) return;
          setIsTranscribing(true);
          try {
            const transcript = await transcribeAudio(base64, mimeType);
            if (mountedRef.current && transcript) {
              setMessageText(prev => prev ? prev + ' ' + transcript : transcript);
            }
          } catch (err) {
            if (mountedRef.current) {
              console.error('Transcription failed:', err);
              setAiError(err instanceof Error ? err.message : 'Failed to transcribe');
            }
          } finally {
            if (mountedRef.current) {
              setIsTranscribing(false);
            }
          }
        };
        reader.readAsDataURL(blob);
      };

      setIsRecording(true);
      mediaRecorder.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setAiError('Could not access microphone. Please allow microphone access.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  async function handleAddMessage() {
    if (!messageText.trim()) return;
    setIsSubmitting(true);
    const currentMode = senderMode;
    try {
      const msg = await createMessage(client.id, currentMode, messageText.trim());
      if (!mountedRef.current) return;
      onMessageAdded(msg);
      setMessageText('');
      // Auto-switch to "I said" after successfully logging client message
      if (currentMode === 'client') {
        setSenderMode('me');
      }
    } catch (err) {
      if (mountedRef.current) {
        setAiError(err instanceof Error ? err.message : 'Failed to add message');
      }
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  async function handleDraftResponse() {
    setAiError(null);
    if (messageText.trim()) {
      // Has draft - improve it
      setIsImproving(true);
      try {
        const improved = await improveMessage(messageText, client.id, client.name);
        if (mountedRef.current) {
          setMessageText(improved);
        }
      } catch (err) {
        if (mountedRef.current) {
          setAiError(err instanceof Error ? err.message : 'Failed to improve');
        }
      } finally {
        if (mountedRef.current) {
          setIsImproving(false);
        }
      }
    } else {
      // Empty - generate new
      setIsGenerating(true);
      try {
        const response = await generateResponse(client.id, client.name);
        if (mountedRef.current) {
          setMessageText(response);
        }
      } catch (err) {
        if (mountedRef.current) {
          setAiError(err instanceof Error ? err.message : 'Failed to generate');
        }
      } finally {
        if (mountedRef.current) {
          setIsGenerating(false);
        }
      }
    }
  }

  function insertSavedResponse(text: string) {
    setMessageText(prev => prev ? prev + '\n\n' + text : text);
  }

  return (
    <div className="message-input">
      {/* Toggle */}
      <div className="sender-toggle">
        <button
          className={`toggle-btn ${senderMode === 'client' ? 'active' : ''}`}
          onClick={() => handleToggle('client')}
        >
          {client.name} said
        </button>
        <button
          className={`toggle-btn ${senderMode === 'me' ? 'active' : ''}`}
          onClick={() => handleToggle('me')}
        >
          I said
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="toast">{toast}</div>
      )}

      {/* Input */}
      <div className="input-section">
        <div className="input-with-voice">
          <textarea
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            onPaste={handlePaste}
            placeholder={senderMode === 'client'
              ? `Paste what ${client.name} said...`
              : 'Write your response...'}
            rows={3}
          />
          <button
            className={`voice-btn ${isRecording ? 'listening' : ''}`}
            onClick={() => isRecording ? stopRecording() : startRecording()}
            disabled={isTranscribing || !aiAvailable}
            title={!aiAvailable ? 'AI required for voice' : isRecording ? 'Stop recording' : 'Voice input'}
          >
            {isRecording ? '⏹' : '🎤'}
          </button>
        </div>

        {/* Quick insert - only in "I said" mode */}
        {senderMode === 'me' && settings && settings.savedResponses.length > 0 && (
          <div className="quick-insert">
            <span>Quick insert:</span>
            {settings.savedResponses.map(sr => (
              <button
                key={sr.id}
                className="chip"
                onClick={() => insertSavedResponse(sr.text)}
                title={sr.text}
              >
                {sr.title}
              </button>
            ))}
          </div>
        )}

        {isTranscribing && (
          <div className="transcribing">Transcribing...</div>
        )}

        {aiError && (
          <div className="ai-error">{aiError}</div>
        )}

        <div className="action-buttons">
          {senderMode === 'me' && (
            <button
              className="btn-ai"
              onClick={handleDraftResponse}
              disabled={isGenerating || isImproving || !aiAvailable || isRecording}
              title={!aiAvailable ? 'AI requires ANTHROPIC_API_KEY' : undefined}
            >
              {isGenerating || isImproving ? 'Thinking...' : '✨ Draft Response'}
            </button>
          )}
          <button
            className="btn-send"
            onClick={handleAddMessage}
            disabled={!messageText.trim() || isSubmitting || isRecording}
          >
            {isSubmitting ? 'Adding...' : 'Add to conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}

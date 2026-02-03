import type { LimitErrorData } from '../types';
import './LimitModal.css';

interface LimitModalProps {
  error: LimitErrorData;
  onClose: () => void;
}

const LIMIT_TITLES: Record<LimitErrorData['limitType'], string> = {
  clients: 'Client Limit Reached',
  messagesPerClient: 'Message Limit Reached',
  aiRespond: 'AI Response Limit Reached',
  aiImprove: 'AI Improve Limit Reached',
  transcribe: 'Transcription Limit Reached',
};

const LIMIT_ICONS: Record<LimitErrorData['limitType'], string> = {
  clients: '\uD83D\uDC65',
  messagesPerClient: '\uD83D\uDCAC',
  aiRespond: '\u2728',
  aiImprove: '\uD83D\uDCDD',
  transcribe: '\uD83C\uDFA4',
};

export default function LimitModal({ error, onClose }: LimitModalProps) {
  const resetDate = new Date(error.resetDate);
  const formattedDate = resetDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="limit-modal-overlay" onClick={onClose}>
      <div className="limit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="limit-modal-icon">{LIMIT_ICONS[error.limitType]}</div>
        <h2>{LIMIT_TITLES[error.limitType]}</h2>
        <p className="limit-message">{error.message}</p>

        <div className="limit-stats">
          <div className="limit-stat">
            <span className="limit-stat-value">{error.current}</span>
            <span className="limit-stat-label">Used</span>
          </div>
          <div className="limit-divider">/</div>
          <div className="limit-stat">
            <span className="limit-stat-value">{error.limit}</span>
            <span className="limit-stat-label">Limit</span>
          </div>
        </div>

        <p className="limit-reset">
          Resets on <strong>{formattedDate}</strong>
        </p>

        <button className="limit-close-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

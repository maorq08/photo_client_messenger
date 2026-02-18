import { useState } from 'react';
import type { Settings, SavedResponse } from '../types';
import { updateSettings, authChangePassword, connectTelegram, disconnectTelegram } from '../api';
import { useTheme } from '../contexts/ThemeContext';
import './SettingsModal.css';

interface Props {
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}

export default function SettingsModal({ settings, onClose, onSave }: Props) {
  const [name, setName] = useState(settings.name);
  const [specialty, setSpecialty] = useState(settings.specialty);
  const [notes, setNotes] = useState(settings.notes);
  const [tone, setTone] = useState(settings.tone || 'friendly and casual');
  const [savedResponses, setSavedResponses] = useState<SavedResponse[]>(settings.savedResponses);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Theme
  const { theme, setTheme } = useTheme();

  // Change password state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Telegram state
  const [telegramUsername, setTelegramUsername] = useState<string | null>(settings.telegram_username ?? null);
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramLinkSent, setTelegramLinkSent] = useState(false);

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    setPasswordChanging(true);
    try {
      await authChangePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPasswordChanging(false);
    }
  }

  async function handleConnectTelegram() {
    setTelegramError(null);
    setTelegramConnecting(true);
    setTelegramLinkSent(false);
    try {
      const { url } = await connectTelegram();
      window.open(url, '_blank');
      setTelegramLinkSent(true);
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setTelegramConnecting(false);
    }
  }

  async function handleDisconnectTelegram() {
    setTelegramError(null);
    try {
      await disconnectTelegram();
      setTelegramUsername(null);
      setTelegramLinkSent(false);
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  async function handleCheckTelegramStatus() {
    try {
      const { fetchSettings } = await import('../api');
      const updated = await fetchSettings();
      setTelegramUsername(updated.telegram_username ?? null);
      if (updated.telegram_username) {
        setTelegramLinkSent(false);
      }
    } catch {
      // silently ignore
    }
  }

  const tonePresets = [
    { value: 'friendly and casual', label: 'Friendly & Casual' },
    { value: 'warm and professional', label: 'Warm & Professional' },
    { value: 'enthusiastic and upbeat', label: 'Enthusiastic & Upbeat' },
    { value: 'calm and reassuring', label: 'Calm & Reassuring' },
    { value: 'short and direct', label: 'Short & Direct' },
  ];

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateSettings({
        name,
        specialty,
        notes,
        tone,
        savedResponses: savedResponses.filter(sr => sr.title.trim() && sr.text.trim()),
        telegram_username: null
      });
      onSave(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  function addResponse() {
    setSavedResponses([
      ...savedResponses,
      { id: Date.now().toString(), trigger: '', title: '', text: '' }
    ]);
  }

  function updateResponse(id: string, field: keyof SavedResponse, value: string) {
    setSavedResponses(savedResponses.map(sr =>
      sr.id === id ? { ...sr, [field]: value } : sr
    ));
  }

  function removeResponse(id: string) {
    setSavedResponses(savedResponses.filter(sr => sr.id !== id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <section className="settings-section">
            <h3>Appearance</h3>
            <p className="section-hint">Choose your visual theme</p>
            <div className="theme-toggle">
              <button
                type="button"
                className={`theme-option ${theme === 'classic' ? 'active' : ''}`}
                onClick={() => setTheme('classic')}
              >
                Classic
              </button>
              <button
                type="button"
                className={`theme-option ${theme === 'pixel-anime' ? 'active' : ''}`}
                onClick={() => setTheme('pixel-anime')}
              >
                Pixel Anime
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Your Info</h3>
            <p className="section-hint">AI uses this to write responses that sound like you</p>

            <div className="field">
              <label>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jeremy"
              />
            </div>

            <div className="field">
              <label>Your Specialty</label>
              <input
                type="text"
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
                placeholder="natural light photography"
              />
            </div>

            <div className="field">
              <label>About You / Your Style</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="I love capturing candid moments..."
                rows={2}
              />
            </div>

            <div className="field">
              <label>Response Tone</label>
              <div className="tone-selector">
                {tonePresets.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`tone-chip ${tone === preset.value ? 'active' : ''}`}
                    onClick={() => setTone(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={tone}
                onChange={e => setTone(e.target.value)}
                placeholder="Or type your own tone..."
                className="tone-custom"
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>Security</h3>
            {passwordSuccess && (
              <div className="success-banner">Password changed successfully!</div>
            )}
            {!showPasswordChange ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowPasswordChange(true)}
              >
                Change Password
              </button>
            ) : (
              <div className="password-change-form">
                <div className="field">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="field">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {passwordError && <div className="field-error">{passwordError}</div>}
                <div className="password-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowPasswordChange(false);
                      setPasswordError(null);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleChangePassword}
                    disabled={passwordChanging}
                  >
                    {passwordChanging ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3>Telegram</h3>
            <p className="section-hint">Log client messages and get AI drafts from Telegram</p>

            {telegramError && <div className="field-error">{telegramError}</div>}

            {telegramUsername ? (
              <div>
                <p style={{ marginBottom: '8px' }}>✅ Connected as @{telegramUsername}</p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDisconnectTelegram}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleConnectTelegram}
                  disabled={telegramConnecting}
                >
                  {telegramConnecting ? 'Generating link...' : 'Connect Telegram'}
                </button>

                {telegramLinkSent && (
                  <div style={{ marginTop: '8px' }}>
                    <p className="section-hint">Tap the link that opened in Telegram to complete setup.</p>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: '6px' }}
                      onClick={handleCheckTelegramStatus}
                    >
                      I connected — refresh status
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3>Saved Responses</h3>
            <p className="section-hint">Quick responses for common questions</p>

            {savedResponses.map(sr => (
              <div key={sr.id} className="saved-response">
                <div className="sr-header">
                  <input
                    type="text"
                    value={sr.title}
                    onChange={e => updateResponse(sr.id, 'title', e.target.value)}
                    placeholder="Button label (e.g., Rates)"
                    className="sr-title"
                  />
                  <button className="remove-btn" onClick={() => removeResponse(sr.id)}>🗑️</button>
                </div>
                <textarea
                  value={sr.text}
                  onChange={e => updateResponse(sr.id, 'text', e.target.value)}
                  placeholder="The full response text..."
                  rows={3}
                />
              </div>
            ))}

            <button className="add-response-btn" onClick={addResponse}>
              + Add Saved Response
            </button>
          </section>
        </div>

        <div className="modal-footer">
          {saveError && <div className="save-error">{saveError}</div>}
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

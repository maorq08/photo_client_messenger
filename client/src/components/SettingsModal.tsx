import { useState } from 'react';
import type { Settings, SavedResponse } from '../types';
import { updateSettings } from '../api';
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
        savedResponses: savedResponses.filter(sr => sr.title.trim() && sr.text.trim())
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

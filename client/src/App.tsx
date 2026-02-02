import { useState, useEffect, useRef, useCallback } from 'react';
import type { Settings, Client, Message } from './types';
import { fetchSettings, fetchClients, fetchMessages } from './api';
import ClientList from './components/ClientList';
import Conversation from './components/Conversation';
import MessageInput from './components/MessageInput';
import SettingsModal from './components/SettingsModal';
import ResizeHandle from './components/ResizeHandle';
import { usePersistedState } from './hooks/usePersistedState';
import { useResize } from './hooks/useResize';
import './App.css';

// Resize constraints
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 320;
const CONVERSATION_MIN = 30;
const CONVERSATION_MAX = 85;
const CONVERSATION_DEFAULT = 70;

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Resizable panel state
  const [sidebarWidth, setSidebarWidth] = usePersistedState('panel-sidebar-width', SIDEBAR_DEFAULT);
  const [conversationHeight, setConversationHeight] = usePersistedState('panel-conversation-height', CONVERSATION_DEFAULT);

  const appRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Horizontal resize (sidebar)
  const sidebarResize = useResize({
    direction: 'horizontal',
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
    value: sidebarWidth,
    onChange: setSidebarWidth,
    containerRef: appRef,
  });

  // Vertical resize (conversation/input)
  const conversationResize = useResize({
    direction: 'vertical',
    min: CONVERSATION_MIN,
    max: CONVERSATION_MAX,
    value: conversationHeight,
    onChange: setConversationHeight,
    containerRef: mainRef,
  });

  // Double-click to reset
  const resetSidebar = useCallback(() => setSidebarWidth(SIDEBAR_DEFAULT), [setSidebarWidth]);
  const resetConversation = useCallback(() => setConversationHeight(CONVERSATION_DEFAULT), [setConversationHeight]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadMessages(selectedClient.id);
    }
  }, [selectedClient]);

  async function loadData() {
    const [settingsData, clientsData] = await Promise.all([
      fetchSettings(),
      fetchClients()
    ]);
    setSettings(settingsData);
    setClients(clientsData);
    if (clientsData.length > 0) {
      setSelectedClient(clientsData[0]);
    }
  }

  async function loadMessages(clientId: string) {
    const msgs = await fetchMessages(clientId);
    setMessages(msgs);
  }

  function handleClientSelect(client: Client) {
    setSelectedClient(client);
    setShowSidebar(false);
  }

  function handleMessageAdded(message: Message) {
    setMessages(prev => [...prev, message]);
  }

  function handleClientsUpdated(updatedClients: Client[]) {
    setClients(updatedClients);
    if (selectedClient) {
      const updated = updatedClients.find(c => c.id === selectedClient.id);
      if (updated) {
        setSelectedClient(updated);
      } else if (updatedClients.length > 0) {
        setSelectedClient(updatedClients[0]);
      } else {
        setSelectedClient(null);
        setMessages([]);
      }
    }
  }

  return (
    <div
      className="app"
      ref={appRef}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        '--conversation-height': `${conversationHeight}%`,
      } as React.CSSProperties}
    >
      <div className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>Clients</h1>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
            ⚙️
          </button>
        </div>
        <ClientList
          clients={clients}
          selectedClient={selectedClient}
          onSelect={handleClientSelect}
          onClientsUpdated={handleClientsUpdated}
        />
      </div>

      <ResizeHandle
        direction="horizontal"
        onPointerDown={sidebarResize.handlePointerDown}
        onPointerMove={sidebarResize.handlePointerMove}
        onPointerUp={sidebarResize.handlePointerUp}
        onDoubleClick={resetSidebar}
      />

      <div className="main" ref={mainRef}>
        {selectedClient ? (
          <>
            <div className="main-header">
              <button className="menu-btn" onClick={() => setShowSidebar(!showSidebar)}>
                ☰
              </button>
              <div className="client-info">
                <h2>{selectedClient.name}</h2>
                {selectedClient.notes && <span className="client-notes">{selectedClient.notes}</span>}
              </div>
            </div>
            <div className="content-area">
              <Conversation
                messages={messages}
                clientName={selectedClient.name}
                myName={settings?.name || 'Me'}
              />
              <ResizeHandle
                direction="vertical"
                onPointerDown={conversationResize.handlePointerDown}
                onPointerMove={conversationResize.handlePointerMove}
                onPointerUp={conversationResize.handlePointerUp}
                onDoubleClick={resetConversation}
              />
              <MessageInput
                client={selectedClient}
                settings={settings}
                onMessageAdded={handleMessageAdded}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <button className="menu-btn mobile-only" onClick={() => setShowSidebar(!showSidebar)}>
              ☰
            </button>
            <p>Select or add a client to start</p>
          </div>
        )}
      </div>

      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(updated) => {
            setSettings(updated);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

export default App;

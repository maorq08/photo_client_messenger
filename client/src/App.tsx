import { useState, useEffect, useRef, useCallback } from 'react';
import type { Settings, Client, Message, LimitErrorData } from './types';
import { fetchSettings, fetchClients, fetchMessages, RateLimitError } from './api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ClientList from './components/ClientList';
import Conversation from './components/Conversation';
import MessageInput from './components/MessageInput';
import SettingsModal from './components/SettingsModal';
import ResizeHandle from './components/ResizeHandle';
import LimitModal from './components/LimitModal';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
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

function MainApp() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [limitError, setLimitError] = useState<LimitErrorData | null>(null);

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
    try {
      const [settingsData, clientsData] = await Promise.all([
        fetchSettings(),
        fetchClients()
      ]);
      setSettings(settingsData);
      setClients(clientsData);
      if (clientsData.length > 0) {
        setSelectedClient(clientsData[0]);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        setLimitError(error.data);
      }
    }
  }

  async function loadMessages(clientId: string) {
    try {
      const msgs = await fetchMessages(clientId);
      setMessages(msgs);
    } catch (error) {
      if (error instanceof RateLimitError) {
        setLimitError(error.data);
      }
    }
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

  function handleLimitError(error: LimitErrorData) {
    setLimitError(error);
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
          <div className="sidebar-header-actions">
            <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
              ⚙️
            </button>
            <button className="icon-btn logout-btn" onClick={logout} title={`Logout (${user?.email})`}>
              🚪
            </button>
          </div>
        </div>
        <ClientList
          clients={clients}
          selectedClient={selectedClient}
          onSelect={handleClientSelect}
          onClientsUpdated={handleClientsUpdated}
          onLimitError={handleLimitError}
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
                onLimitError={handleLimitError}
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

      {limitError && (
        <LimitModal
          error={limitError}
          onClose={() => setLimitError(null)}
        />
      )}
    </div>
  );
}

function AppWithAuth() {
  const { user, loading } = useAuth();
  const [resetToken, setResetToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  });

  // Handle reset password flow
  function handleResetComplete() {
    setResetToken(null);
    // Clear URL parameters
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (resetToken) {
    return <ResetPassword token={resetToken} onComplete={handleResetComplete} />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </ThemeProvider>
  );
}

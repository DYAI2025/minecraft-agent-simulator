import React, { useState, useEffect } from 'react';
import { LLMProviderConfig, LLMProviderType } from '../types/index.js';
import { Shield, Key, Network, Eye, EyeOff, Check, RefreshCw, Trash2, AlertCircle, Clock } from 'lucide-react';

interface ProvidersCardProps {
  providers: any[];
  onUpdateProvider: (config: {
    id: string;
    type: LLMProviderType;
    apiKey: string;
    customUrl?: string;
    defaultModel?: string;
  }) => Promise<void>;
  onDeleteSecret?: (id: string) => Promise<void>;
}

export const ProvidersCard: React.FC<ProvidersCardProps> = ({
  providers,
  onUpdateProvider,
  onDeleteSecret,
}) => {
  const [activeId, setActiveId] = useState<string>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  
  // Save states
  const [isUpdating, setIsUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Test states
  const [isTesting, setIsTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Deleting states
  const [isDeleting, setIsDeleting] = useState(false);

  const activeProvider = providers.find(p => p.id === activeId);

  useEffect(() => {
    if (activeProvider) {
      setApiKey('');
      setCustomUrl(activeProvider.customUrl || '');
      setDefaultModel(activeProvider.defaultModel || '');
      setSuccess(false);
      setSaveError(null);
      setTestFeedback(null);
    }
  }, [activeId, activeProvider]);

  const hasCustomUrl = activeProvider?.type === LLMProviderType.OLLAMA ||
                        activeProvider?.type === LLMProviderType.LMSTUDIO ||
                        activeProvider?.type === LLMProviderType.OPENROUTER;
  const hasApiKey = activeProvider?.type === LLMProviderType.GEMINI ||
                    activeProvider?.type === LLMProviderType.OPENAI ||
                    activeProvider?.type === LLMProviderType.ANTHROPIC ||
                    activeProvider?.type === LLMProviderType.OPENROUTER;

  const isUnsaved = activeProvider ? (
    defaultModel !== (activeProvider.defaultModel || '') ||
    (hasCustomUrl && customUrl !== (activeProvider.customUrl || '')) ||
    (hasApiKey && apiKey !== '')
  ) : false;

  const handleTestConnection = async () => {
    if (!activeProvider) return;
    setIsTesting(true);
    setTestFeedback(null);
    try {
      const res = await fetch(`/api/providers/${activeProvider.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeProvider.type,
          apiKey: apiKey,
          customUrl: customUrl,
          defaultModel: defaultModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestFeedback({ success: true, message: data.message || 'Success' });
      } else {
        setTestFeedback({ success: false, message: data.message || data.error || 'Connection verification failed.' });
      }
    } catch (err: any) {
      setTestFeedback({ success: false, message: err.message || 'Network error executing connectivity test.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProvider) return;
    setIsUpdating(true);
    setSuccess(false);
    setSaveError(null);

    try {
      await onUpdateProvider({
        id: activeProvider.id,
        type: activeProvider.type,
        apiKey: apiKey,
        customUrl: customUrl || undefined,
        defaultModel: defaultModel,
      });
      setSuccess(true);
      setApiKey('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update provider config:', err);
      setSaveError(err.message || 'Failed to save.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!activeProvider || !onDeleteSecret) return;
    if (!window.confirm(`Are you sure you want to delete secret key for provider "${activeProvider.name}"?`)) {
      return;
    }
    setIsDeleting(true);
    setSaveError(null);
    setSuccess(false);
    try {
      await onDeleteSecret(activeProvider.id);
      setApiKey('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      console.error('Failed to delete secret:', err);
      setSaveError(err.message || 'Failed to delete secret.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfigured = activeProvider?.secretMetadata?.configured || activeProvider?.isConfigured;
  const last4 = activeProvider?.secretMetadata?.last4;
  const updatedAt = activeProvider?.secretMetadata?.updatedAt;

  return (
    <div id="providers-card" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">AI Provider Setup // COGNITIVE</h2>
        </div>
        <div className="text-[9px] text-brand-muted flex items-center gap-1 font-mono uppercase">
          <Network className="w-3.5 h-3.5 text-brand-muted" />
          <span>Local Sockets + Web APIs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
        {/* Left column: List of providers */}
        <div className="md:col-span-1 border-r border-brand-border pr-2 space-y-1">
          {providers.map((p) => {
            const isProvConfigured = p.secretMetadata?.configured || p.isConfigured;
            return (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`w-full text-left p-2 rounded-none transition-all flex items-center justify-between font-mono ${
                  activeId === p.id
                    ? 'bg-brand-border-light text-brand-text border border-brand-border'
                    : 'bg-brand-bg hover:bg-brand-row text-brand-muted hover:text-brand-text border border-brand-border/40'
                }`}
              >
                <div>
                  <span className="text-xs font-bold block">{p.name}</span>
                  <span className="text-[9px] opacity-60 block uppercase">{p.type}</span>
                </div>
                {isProvConfigured && (
                  <span className="text-[8px] bg-brand-green/10 text-brand-green px-1.5 py-0.5 rounded-none border border-brand-green/20 font-bold uppercase">
                    Configured
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right column: Form details */}
        <div className="md:col-span-2">
          {activeProvider ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-border pb-2 mb-2">
                <div>
                  <h3 className="text-xs font-mono font-bold text-brand-text">{activeProvider.name} Gateway Config</h3>
                  <div className="flex flex-wrap gap-2 mt-1 items-center">
                    {isConfigured ? (
                      <span className="text-[9px] font-mono font-bold text-brand-green uppercase flex items-center gap-1">
                        ● Configured {last4 ? `(ends in ${last4})` : ''}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-brand-muted uppercase">
                        ○ Not Configured
                      </span>
                    )}

                    {updatedAt && (
                      <span className="text-[9px] text-brand-muted font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-brand-muted" /> Last saved: {new Date(updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Unified Save Status and Testing Metadata badges */}
                <div className="flex flex-wrap gap-1.5 items-center justify-end">
                  {isUpdating && (
                    <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse">
                      Saving...
                    </span>
                  )}
                  {success && !isUpdating && (
                    <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase bg-brand-green/15 text-brand-green border border-brand-green/20">
                      Saved
                    </span>
                  )}
                  {saveError && (
                    <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/20">
                      Save failed
                    </span>
                  )}
                  {isUnsaved && !isUpdating && !success && (
                    <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase bg-orange-500/15 text-orange-400 border border-orange-500/20 animate-pulse">
                      Unsaved
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 font-mono italic">Target Model ID</label>
                <input
                  type="text"
                  className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-3 py-2 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="e.g. gemini-2.5-flash"
                />
              </div>

              {hasApiKey && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[9px] text-brand-muted uppercase font-mono italic font-bold">Secret API Key</label>
                    {isConfigured && onDeleteSecret && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-[9px] font-mono font-bold text-red-400 hover:text-red-500 hover:underline flex items-center gap-0.5 transition-all disabled:opacity-50"
                        title="Delete stored secret credentials"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete secret
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-3" />
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="w-full text-xs bg-brand-bg border border-brand-border rounded-none pl-9 pr-10 py-2 text-brand-text focus:outline-none focus:border-brand-green transition-colors font-mono"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={isConfigured ? '••••••••••••••••••••••••••••••••' : 'Enter secret API Key...'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-2.5 text-brand-muted hover:text-brand-text transition-colors"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {hasCustomUrl && (
                <div>
                  <label className="block text-[9px] text-brand-muted uppercase mb-1 font-mono italic">Gateway Endpoint URL</label>
                  <input
                    type="text"
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-3 py-2 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={activeProvider.type === LLMProviderType.OLLAMA ? 'http://localhost:11434' : 'http://localhost:1234'}
                  />
                </div>
              )}

              {saveError && (
                <div className="p-2.5 bg-red-500/5 border border-red-500/20 text-red-400 font-mono text-[10px] flex items-center gap-1.5 leading-relaxed">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Save Error: {saveError}</span>
                </div>
              )}

              <div className="bg-brand-panel border border-brand-border p-3 space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-brand-green font-mono font-bold tracking-widest uppercase">Gateway Connection Test</span>
                  <span className="text-[9px] font-mono text-brand-muted border border-brand-border px-1">GATEWAY-PING</span>
                </div>
                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                  className="w-full text-center py-1.5 bg-brand-border-light hover:bg-brand-border text-brand-text border border-brand-border font-mono text-[10px] uppercase font-bold tracking-wider rounded-none cursor-pointer flex items-center justify-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-green" />
                      Testing gateway socket...
                    </>
                  ) : (
                    'Verify Connection'
                  )}
                </button>
                {testFeedback && (
                  <div className={`p-2 font-mono text-[10px] border leading-relaxed ${
                    testFeedback.success 
                      ? 'bg-brand-green/5 text-brand-green border-brand-green/20' 
                      : 'bg-red-500/5 text-red-400 border-red-500/20'
                  }`}>
                    <div className="font-bold uppercase mb-1">
                      {testFeedback.success ? '✓ Test passed' : '⚠ Test failed'}
                    </div>
                    {testFeedback.message}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-brand-border pt-4 mt-6">
                <span className="text-[10px] text-brand-muted flex items-center gap-1 font-mono uppercase">
                  <Shield className="w-3.5 h-3.5 text-brand-muted" /> TLS Secure Sockets
                </span>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-2 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors disabled:opacity-40"
                >
                  {isUpdating ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : success ? (
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                  ) : null}
                  {isUpdating ? 'Saving...' : success ? 'Credentials Saved!' : 'Save Credentials'}
                </button>
              </div>
            </form>
          ) : (
            <div className="h-full flex items-center justify-center text-brand-muted font-mono text-xs uppercase">
              Select a provider to configure.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

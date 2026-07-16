import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BotProfile } from '../domain/bots/bot-profile.schema.ts';
import { usePersistence } from '../hooks/usePersistence.js';
import { Cpu, Plus, Trash2, Edit, Copy, Save, Check, AlertCircle, Layers, Clipboard } from 'lucide-react';

interface BotProfileLibraryProps {
  onAppendToScenario?: (profile: BotProfile) => void;
  reloadTrigger?: number;
  onProfileSaved?: () => void;
}

const emptyProfile: BotProfile = {
  id: '',
  name: '',
  role: '',
  goal: '',
  providerId: 'gemini',
  model: 'gemini-3.5-flash',
  characterPrompt: '',
  behaviorPrompt: '',
  inventory: {},
  lastSavedAt: '',
};

export const BotProfileLibrary: React.FC<BotProfileLibraryProps> = ({
  onAppendToScenario,
  reloadTrigger = 0,
  onProfileSaved,
}) => {
  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Form states
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formGoal, setFormGoal] = useState('');
  const [formProviderId, setFormProviderId] = useState('gemini');
  const [formModel, setFormModel] = useState('gemini-3.5-flash');
  const [formCharacterPrompt, setFormCharacterPrompt] = useState('');
  const [formBehaviorPrompt, setFormBehaviorPrompt] = useState('');
  const [formInventory, setFormInventory] = useState<{ item: string; count: number }[]>([]);

  // Key-Value additions for Inventory
  const [newItemName, setNewItemName] = useState('');
  const [newItemCount, setNewItemCount] = useState(1);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch profiles from backend
  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/bot-profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error('Failed to fetch bot profiles:', err);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [reloadTrigger]);

  // Selected profile memo
  const selectedProfile = useMemo(() => {
    return profiles.find(p => p.id === selectedProfileId) || null;
  }, [profiles, selectedProfileId]);

  // Map inventory object to flat array for form editing
  const getInventoryArray = (inv: Record<string, number> = {}) => {
    return Object.entries(inv).map(([item, count]) => ({ item, count }));
  };

  // Map flat array back to Record object for saving
  const getInventoryRecord = (arr: { item: string; count: number }[]) => {
    const rec: Record<string, number> = {};
    arr.forEach(row => {
      if (row.item.trim()) {
        rec[row.item.trim()] = Number(row.count) || 1;
      }
    });
    return rec;
  };

  // Prepare "persisted" vs "current" state for usePersistence hook
  const persistedValue = useMemo<BotProfile>(() => {
    if (isCreateMode) return emptyProfile;
    return selectedProfile || emptyProfile;
  }, [selectedProfile, isCreateMode]);

  const currentValue = useMemo<BotProfile>(() => {
    return {
      id: formId,
      name: formName,
      role: formRole,
      goal: formGoal,
      providerId: formProviderId,
      model: formModel,
      characterPrompt: formCharacterPrompt,
      behaviorPrompt: formBehaviorPrompt,
      inventory: getInventoryRecord(formInventory),
      lastSavedAt: persistedValue.lastSavedAt,
    };
  }, [
    formId,
    formName,
    formRole,
    formGoal,
    formProviderId,
    formModel,
    formCharacterPrompt,
    formBehaviorPrompt,
    formInventory,
    persistedValue,
  ]);

  // usePersistence hook handles loading, saving, and dirty states for form configuration sections
  const persistence = usePersistence<BotProfile>(persistedValue, currentValue, {
    onSave: async (val) => {
      const isPut = !isCreateMode && selectedProfileId;
      const url = isPut ? `/api/bot-profiles/${selectedProfileId}` : '/api/bot-profiles';
      const method = isPut ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(val),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save bot profile.');
      }

      const data = await res.json();
      await fetchProfiles();
      
      // Select the saved profile
      setSelectedProfileId(data.profile.id);
      setIsEditing(false);
      setIsCreateMode(false);
      setFeedbackMessage({ type: 'success', text: `Profile "${data.profile.name}" saved successfully!` });
      setTimeout(() => setFeedbackMessage(null), 3000);

      if (onProfileSaved) {
        onProfileSaved();
      }
    },
  });

  // Populate form when selection or mode changes
  useEffect(() => {
    if (isCreateMode) {
      setFormId('');
      setFormName('');
      setFormRole('Assistant');
      setFormGoal('Explore and help out');
      setFormProviderId('gemini');
      setFormModel('gemini-2.5-flash');
      setFormCharacterPrompt('');
      setFormBehaviorPrompt('');
      setFormInventory([]);
    } else if (selectedProfile) {
      setFormId(selectedProfile.id);
      setFormName(selectedProfile.name);
      setFormRole(selectedProfile.role || 'Assistant');
      setFormGoal(selectedProfile.goal || 'Explore and help out');
      setFormProviderId(selectedProfile.providerId || 'gemini');
      setFormModel(selectedProfile.model || 'gemini-2.5-flash');
      setFormCharacterPrompt(selectedProfile.characterPrompt || '');
      setFormBehaviorPrompt(selectedProfile.behaviorPrompt || '');
      setFormInventory(getInventoryArray(selectedProfile.inventory));
    }
  }, [selectedProfile, isCreateMode]);

  // Inventory modifications
  const handleAddInventoryRow = () => {
    if (!newItemName.trim()) return;
    const existingIdx = formInventory.findIndex(row => row.item.toLowerCase() === newItemName.trim().toLowerCase());
    if (existingIdx > -1) {
      // Update count
      const updated = [...formInventory];
      updated[existingIdx].count += newItemCount;
      setFormInventory(updated);
    } else {
      setFormInventory([...formInventory, { item: newItemName.trim(), count: newItemCount }]);
    }
    setNewItemName('');
    setNewItemCount(1);
  };

  const handleRemoveInventoryRow = (itemToRemove: string) => {
    setFormInventory(formInventory.filter(row => row.item !== itemToRemove));
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete profile "${id}"?`)) return;
    try {
      const res = await fetch(`/api/bot-profiles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchProfiles();
        if (selectedProfileId === id) {
          setSelectedProfileId(null);
          setIsEditing(false);
        }
        setFeedbackMessage({ type: 'success', text: `Deleted profile "${id}" successfully.` });
        setTimeout(() => setFeedbackMessage(null), 3000);
      } else {
        const err = await res.json();
        setFeedbackMessage({ type: 'error', text: err.error || 'Failed to delete profile.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Error occurred deleting profile.' });
    }
  };

  const handleCopyMarkdown = (p: BotProfile) => {
    const invStr = Object.entries(p.inventory || {})
      .map(([item, qty]) => `${item}: ${qty}`)
      .join(', ');

    const markdownBlock = `### Bot: ${p.name}
- Role: ${p.role}
- Goal: ${p.goal}
- Provider: ${p.providerId}
- Model: ${p.model}
- Position: 0, 64, 0
${invStr ? `- Inventory: ${invStr}\n` : ''}`;

    navigator.clipboard.writeText(markdownBlock);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div id="bot-profile-library" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold font-mono">Bot Profile Library // BEHAVIOR</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsCreateMode(true);
              setIsEditing(true);
              setSelectedProfileId(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono uppercase font-bold rounded-none bg-brand-green text-brand-bg hover:opacity-90 transition-colors"
          >
            <Plus className="w-3 h-3" /> New Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
        {/* Profile Templates List */}
        <div className="md:col-span-1 border-r border-brand-border pr-2 space-y-1 overflow-y-auto max-h-[480px]">
          {profiles.length === 0 ? (
            <div className="text-[10px] font-mono text-brand-muted italic p-2 text-center">
              No profiles found in library.
            </div>
          ) : (
            profiles.map((p) => (
              <div
                key={p.id}
                className={`w-full p-2 rounded-none transition-all flex flex-col gap-1 border ${
                  selectedProfileId === p.id && !isCreateMode
                    ? 'bg-brand-border-light border-brand-border text-brand-text'
                    : 'bg-brand-bg hover:bg-brand-row text-brand-muted hover:text-brand-text border-brand-border/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedProfileId(p.id);
                      setIsCreateMode(false);
                      setIsEditing(false);
                    }}
                    className="flex-grow text-left font-mono"
                  >
                    <span className="text-xs font-bold block text-brand-green">{p.name}</span>
                    <span className="text-[8px] opacity-60 uppercase block">ID: {p.id} // {p.role}</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopyMarkdown(p)}
                      title="Copy Markdown block"
                      className="p-1 hover:text-brand-green text-brand-muted transition-colors rounded"
                    >
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Clipboard className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProfileId(p.id);
                        setIsCreateMode(false);
                        setIsEditing(true);
                      }}
                      title="Edit Profile"
                      className="p-1 hover:text-brand-green text-brand-muted transition-colors rounded"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(p.id)}
                      title="Delete Profile"
                      className="p-1 hover:text-red-500 text-brand-muted transition-colors rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {onAppendToScenario && (
                  <button
                    onClick={() => onAppendToScenario(p)}
                    className="w-full mt-1.5 py-0.5 text-center text-[8px] font-mono uppercase bg-brand-border hover:bg-brand-border-light text-brand-text font-bold tracking-wider"
                  >
                    + Append to active scenario
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Profile Edit/View Detail Workspace */}
        <div className="md:col-span-2 flex flex-col justify-between">
          {isEditing || isCreateMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                persistence.save();
              }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-1.5">
                <h3 className="text-xs font-mono font-bold text-brand-text">
                  {isCreateMode ? 'Create New Bot Profile' : `Modify Profile: ${formId}`}
                </h3>
                <div className="flex items-center gap-2">
                  {persistence.status === 'saving' && (
                    <span className="text-[8px] font-mono text-yellow-500 uppercase animate-pulse">Saving...</span>
                  )}
                  {persistence.status === 'failed' && (
                    <span className="text-[8px] font-mono text-red-500 uppercase font-bold">Failed</span>
                  )}
                  {persistence.isDirty && persistence.status !== 'saving' && (
                    <span className="text-[8px] font-mono text-yellow-500 uppercase font-bold animate-pulse">● Unsaved Changes</span>
                  )}
                  {persistence.status === 'saved' && (
                    <span className="text-[8px] font-mono text-brand-green uppercase font-bold">✓ Saved</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Profile ID (alphanumeric)</label>
                  <input
                    type="text"
                    disabled={!isCreateMode}
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-50"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="e.g. specialized_miner"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Bot Display Name</label>
                  <input
                    type="text"
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. MinerMax"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Swarm Role / Specialty</label>
                  <input
                    type="text"
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="e.g. Deep Digger"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Autonomous Goal</label>
                  <input
                    type="text"
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={formGoal}
                    onChange={(e) => setFormGoal(e.target.value)}
                    placeholder="e.g. Mine ores and report coordinates"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Cognitive Provider</label>
                  <select
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={formProviderId}
                    onChange={(e) => setFormProviderId(e.target.value)}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI GPT</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Model Blueprint</label>
                  <input
                    type="text"
                    className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="e.g. gemini-2.5-flash"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Character Persona Prompt</label>
                <textarea
                  className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none p-2 text-brand-text focus:outline-none focus:border-brand-green resize-none h-[64px]"
                  value={formCharacterPrompt}
                  onChange={(e) => setFormCharacterPrompt(e.target.value)}
                  placeholder="You are a grizzled subterranean miner who uses mining slangs..."
                />
              </div>

              <div>
                <label className="block text-[8px] text-brand-muted uppercase mb-0.5 font-mono italic">Core Behavior Algorithm Prompt</label>
                <textarea
                  className="w-full text-xs font-mono bg-brand-bg border border-brand-border rounded-none p-2 text-brand-text focus:outline-none focus:border-brand-green resize-none h-[64px]"
                  value={formBehaviorPrompt}
                  onChange={(e) => setFormBehaviorPrompt(e.target.value)}
                  placeholder="When tasked, look for valuable vein blocks. Walk to them and mine them with pickaxes..."
                />
              </div>

              {/* Inventory Key-Value Creator */}
              <div>
                <label className="block text-[8px] text-brand-muted uppercase mb-1 font-mono italic">Starting Inventory Loadout</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    className="flex-grow text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item (e.g. stone_pickaxe)"
                  />
                  <input
                    type="number"
                    min="1"
                    className="w-16 text-xs font-mono bg-brand-bg border border-brand-border rounded-none px-2 py-1 text-brand-text focus:outline-none focus:border-brand-green"
                    value={newItemCount}
                    onChange={(e) => setNewItemCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                  <button
                    type="button"
                    onClick={handleAddInventoryRow}
                    className="bg-brand-border-light hover:bg-brand-border border border-brand-border px-3 text-xs font-mono font-bold uppercase rounded-none"
                  >
                    Add
                  </button>
                </div>
                {formInventory.length > 0 && (
                  <div className="border border-brand-border bg-brand-bg p-2 max-h-[84px] overflow-y-auto space-y-1 rounded-none">
                    {formInventory.map((row) => (
                      <div key={row.item} className="flex items-center justify-between text-[10px] font-mono border-b border-brand-border/30 pb-0.5 last:border-0">
                        <span>
                          <strong className="text-brand-green">{row.item}</strong> x{row.count}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInventoryRow(row.item)}
                          className="text-red-400 hover:text-red-500 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setIsCreateMode(false);
                  }}
                  className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase rounded-none border border-brand-border hover:bg-brand-row transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={persistence.status === 'saving'}
                  className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-green text-brand-bg hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" />
                  {persistence.status === 'saving' ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          ) : selectedProfile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
                <div>
                  <span className="text-[8px] text-brand-green font-mono font-bold tracking-widest block uppercase">BOT TEMPLATE</span>
                  <h3 className="text-sm font-mono font-bold text-brand-text">{selectedProfile.name}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyMarkdown(selectedProfile)}
                    className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase font-bold rounded-none border border-brand-border hover:bg-brand-row transition-colors text-brand-text"
                  >
                    {copiedId === selectedProfile.id ? <Check className="w-3 h-3 text-brand-green" /> : <Copy className="w-3 h-3" />}
                    Copy Markdown
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase font-bold rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Edit Profile
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-[8px] text-brand-muted uppercase block">ROLE</span>
                  <span className="text-brand-text">{selectedProfile.role}</span>
                </div>
                <div>
                  <span className="text-[8px] text-brand-muted uppercase block">GOAL</span>
                  <span className="text-brand-text">{selectedProfile.goal}</span>
                </div>
                <div>
                  <span className="text-[8px] text-brand-muted uppercase block">COGNITIVE GATEWAY</span>
                  <span className="text-brand-text uppercase">{selectedProfile.providerId} // {selectedProfile.model}</span>
                </div>
                <div>
                  <span className="text-[8px] text-brand-muted uppercase block">LAST PERSISTED</span>
                  <span className="text-brand-muted opacity-80">{selectedProfile.lastSavedAt ? new Date(selectedProfile.lastSavedAt).toLocaleString() : 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-brand-border/30 pt-3">
                {selectedProfile.characterPrompt && (
                  <div>
                    <span className="text-[8px] text-brand-muted uppercase font-mono block">Character Persona Prompt</span>
                    <p className="bg-brand-bg border border-brand-border/40 p-2 text-[10px] font-mono text-brand-muted leading-relaxed max-h-[80px] overflow-y-auto">
                      {selectedProfile.characterPrompt}
                    </p>
                  </div>
                )}
                {selectedProfile.behaviorPrompt && (
                  <div>
                    <span className="text-[8px] text-brand-muted uppercase font-mono block">Core Behavior Algorithm Prompt</span>
                    <p className="bg-brand-bg border border-brand-border/40 p-2 text-[10px] font-mono text-brand-muted leading-relaxed max-h-[80px] overflow-y-auto">
                      {selectedProfile.behaviorPrompt}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-brand-border/30 pt-3">
                <span className="text-[8px] text-brand-muted uppercase font-mono block mb-1">Loadout Inventory Slots</span>
                {Object.keys(selectedProfile.inventory || {}).length === 0 ? (
                  <span className="text-[9px] font-mono text-brand-muted italic">Empty inventory</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(selectedProfile.inventory).map(([item, count]) => (
                      <span key={item} className="text-[9px] font-mono bg-brand-panel border border-brand-border px-2 py-0.5 text-brand-text">
                        <strong className="text-brand-green">{item}</strong> x{count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {onAppendToScenario && (
                <button
                  onClick={() => onAppendToScenario(selectedProfile)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-brand-green text-brand-bg hover:opacity-90 font-mono font-bold text-[10px] uppercase transition-opacity mt-4"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Append {selectedProfile.name} to Scenario Markdown
                </button>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-brand-muted border border-dashed border-brand-border rounded-none">
              <Layers className="w-8 h-8 text-brand-border mb-2" />
              <p className="text-xs font-mono">No profile selected.</p>
              <p className="text-[9px] text-brand-muted mt-1 max-w-[220px] font-mono uppercase tracking-tight">
                Select a bot profile from the library list or create a custom behavior template
              </p>
            </div>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div className={`mt-3 border p-2 text-[10px] font-mono flex items-center gap-2 ${
          feedbackMessage.type === 'success' 
            ? 'bg-brand-green/5 border-brand-green/20 text-brand-green' 
            : 'bg-red-500/5 border-red-500/20 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{feedbackMessage.text}</span>
        </div>
      )}
      {persistence.error && (
        <div className="mt-3 bg-red-950/40 border border-red-500/30 p-2 text-[10px] font-mono text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{persistence.error}</span>
        </div>
      )}
    </div>
  );
};

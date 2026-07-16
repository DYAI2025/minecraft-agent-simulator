import React, { useState, useRef, useEffect } from 'react';
import { Scenario, ScenarioV2 } from '../types/index.js';
import { DEFAULT_SCENARIOS, COMPLEX_TEMPLATES } from '../data/scenarios.js';
import { 
  FileCode, 
  AlertCircle, 
  Sparkles, 
  ChevronDown, 
  Upload, 
  Save, 
  BookOpen, 
  Edit, 
  Trash2, 
  Check,
  Download
} from 'lucide-react';

function convertScenarioToMarkdown(scenario: Scenario): string {
  let md = `# Scenario: ${scenario.title || 'Imported Scenario'}\n\n`;
  md += `${scenario.description || 'A simulation run.'}\n\n`;
  if (scenario.version) {
    md += `Version: ${scenario.version}\n\n`;
  }
  if (scenario.scenarioPrompt || scenario.scenario_prompt) {
    md += `## Scenario Prompt\n${scenario.scenarioPrompt || scenario.scenario_prompt}\n\n`;
  }
  if (scenario.worldConfig) {
    md += `## World Configuration\n`;
    if (scenario.worldConfig.seed) md += `- Seed: ${scenario.worldConfig.seed}\n`;
    if (scenario.worldConfig.gameMode || scenario.worldConfig.game_mode) md += `- GameMode: ${scenario.worldConfig.gameMode || scenario.worldConfig.game_mode}\n`;
    if (scenario.worldConfig.difficulty) md += `- Difficulty: ${scenario.worldConfig.difficulty}\n`;
    if (scenario.worldConfig.port) md += `- Port: ${scenario.worldConfig.port}\n`;
    if (scenario.worldConfig.levelName || scenario.worldConfig.level_name) md += `- LevelName: ${scenario.worldConfig.levelName || scenario.worldConfig.level_name}\n`;
    md += `\n`;
  }
  if (scenario.objectives && scenario.objectives.length > 0) {
    md += `## Objectives\n`;
    scenario.objectives.forEach(obj => {
      md += `- ${obj}\n`;
    });
    md += `\n`;
  }
  if (scenario.research) {
    md += `## Research\n`;
    if (scenario.research.question) md += `- Question: ${scenario.research.question}\n`;
    if (scenario.research.hypothesis) md += `- Hypothesis: ${scenario.research.hypothesis}\n`;
    if (scenario.research.measurementFocus) md += `- Measurement Focus: ${scenario.research.measurementFocus.join(', ')}\n`;
    if (scenario.research.observationProtocol) md += `- Observation Protocol: ${scenario.research.observationProtocol}\n`;
    if (scenario.research.expectedEmergencePatterns) md += `- Expected Emergence Patterns: ${scenario.research.expectedEmergencePatterns.join(', ')}\n`;
    md += `\n`;
  }
  if (scenario.bots && scenario.bots.length > 0) {
    md += `## Bots\n`;
    scenario.bots.forEach(bot => {
      md += `### Bot: ${bot.name}\n`;
      md += `- Role: ${bot.role}\n`;
      md += `- Goal: ${bot.goal}\n`;
      md += `- Provider: ${bot.providerId}\n`;
      md += `- Model: ${bot.model}\n`;
      md += `- Position: ${bot.x}, ${bot.y}, ${bot.z}\n`;
      if (bot.inventory && Object.keys(bot.inventory).length > 0) {
        const invStr = Object.entries(bot.inventory).map(([item, qty]) => `${item}:${qty}`).join(', ');
        md += `- Inventory: ${invStr}\n`;
      }
      if (bot.characterPrompt || bot.character_prompt) md += `- Character Prompt: ${bot.characterPrompt || bot.character_prompt}\n`;
      if (bot.behaviorPrompt || bot.behavior_prompt) md += `- Behavior Prompt: ${bot.behaviorPrompt || bot.behavior_prompt}\n`;
      md += `\n`;
    });
  }
  return md;
}

export type ScenarioItem = ScenarioV2;

interface ScenarioCardProps {
  onParseScenario: (markdown: string) => Promise<Scenario | null>;
  onSpawnBots: (scenario: Scenario) => Promise<void>;
  serverStatus: 'stopped' | 'validating' | 'blocked' | 'starting' | 'running' | 'stopping' | 'failed';
  activeScenario?: Scenario;
  onApplyWorldConfig?: (config: any) => Promise<void>;
  markdown: string;
  setMarkdown: React.Dispatch<React.SetStateAction<string>>;
  onSaveBotToLibrary?: (bot: any) => Promise<void>;
  activeScenarioId?: string;
  onApplyScenario?: (id: string) => Promise<void>;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({
  onParseScenario,
  onSpawnBots,
  serverStatus,
  activeScenario,
  onApplyWorldConfig,
  markdown,
  setMarkdown,
  onSaveBotToLibrary,
  activeScenarioId,
  onApplyScenario,
}) => {
  const [parsedScenario, setParsedScenario] = useState<Scenario | null>(activeScenario || null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSpawning, setIsSpawning] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sprint 4 additions: Saved Library, Status, and Apply states
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'library'>('editor');
  const [savedScenarios, setSavedScenarios] = useState<ScenarioItem[]>([]);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState<string>(markdown);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState<boolean>(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  // Fetch all saved scenarios
  const fetchSavedScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (res.ok) {
        const data = await res.json();
        setSavedScenarios(data.scenarios || []);
      }
    } catch (err) {
      console.error('Failed to fetch saved scenarios:', err);
    }
  };

  useEffect(() => {
    fetchSavedScenarios();
  }, []);

  // Sync active scenario ID on load/change
  useEffect(() => {
    if (activeScenarioId) {
      setCurrentScenarioId(activeScenarioId);
      const matched = savedScenarios.find(s => s.id === activeScenarioId);
      if (matched) {
        setMarkdown(matched.originalMarkdown);
        setLastSavedMarkdown(matched.originalMarkdown);
        setParsedScenario(matched.parsedScenario);
      }
    }
  }, [activeScenarioId, savedScenarios]);

  // Handle parsing markdown content
  const handleParseScenario = async (content: string) => {
    setError(null);
    setIsParsing(true);
    try {
      const scenario = await onParseScenario(content);
      if (scenario) {
        setParsedScenario(scenario);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse scenario markdown.');
      setParsedScenario(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Save/Update Scenario in database
  const handleSaveScenario = async (forceNew: boolean = false) => {
    setError(null);
    setIsSaving(true);
    setSaveFailed(false);
    try {
      const scenario = await onParseScenario(markdown);
      if (!scenario) {
        throw new Error('Could not parse scenario details. Please fix parser errors first.');
      }

      const activeId = forceNew ? null : currentScenarioId;
      const idToSave = activeId || scenario.title.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `scenario_${Date.now()}`;
      
      const url = activeId ? `/api/scenarios/${activeId}` : '/api/scenarios';
      const method = activeId ? 'PUT' : 'POST';

      const body = activeId
        ? {
            title: scenario.title,
            description: scenario.description,
            markdown,
            parsedScenario: scenario,
          }
        : {
            id: idToSave,
            title: scenario.title,
            description: scenario.description,
            markdown,
            parsedScenario: scenario,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save scenario.');
      }

      const resData = await res.json();
      const savedItem = resData.scenario;

      setCurrentScenarioId(savedItem.id);
      setLastSavedMarkdown(markdown);
      setParsedScenario(scenario);
      setLastSavedAt(new Date().toLocaleTimeString());
      setSaveFailed(false);
      await fetchSavedScenarios();
    } catch (err: any) {
      setError(err.message || 'Failed to save scenario.');
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Apply scenario to workspace (activeScenarioId in config)
  const handleApplyScenario = async (id: string) => {
    try {
      setError(null);
      if (onApplyScenario) {
        await onApplyScenario(id);
      } else {
        const res = await fetch(`/api/scenarios/${id}/apply`, {
          method: 'POST',
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to apply scenario.');
        }
      }
      setAppliedId(id);
      setTimeout(() => setAppliedId(null), 3000);
      await fetchSavedScenarios();
    } catch (err: any) {
      setError(err.message || 'Failed to apply scenario.');
    }
  };

  // Delete scenario from database
  const handleDeleteScenario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this scenario from your library?')) {
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/scenarios/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete scenario.');
      }
      if (currentScenarioId === id) {
        setCurrentScenarioId(null);
        setLastSavedMarkdown('');
      }
      await fetchSavedScenarios();
    } catch (err: any) {
      setError(err.message || 'Failed to delete scenario.');
    }
  };

  // Load saved scenario markdown into editor
  const handleLoadScenario = (scenarioItem: ScenarioItem) => {
    setMarkdown(scenarioItem.originalMarkdown);
    setLastSavedMarkdown(scenarioItem.originalMarkdown);
    setCurrentScenarioId(scenarioItem.id);
    setParsedScenario(scenarioItem.parsedScenario);
    setActiveSubTab('editor');
    setError(null);
  };

  const handleFileImportContent = async (content: string) => {
    setError(null);
    setCurrentScenarioId(null);
    setLastSavedMarkdown(''); // Mark as unsaved
    
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      // It's likely JSON!
      setIsParsing(true);
      try {
        const json = JSON.parse(trimmed);
        
        let targetMarkdown = '';
        let scenarioToUse: Scenario | null = null;
        
        if (json.originalMarkdown !== undefined) {
          targetMarkdown = json.originalMarkdown;
          scenarioToUse = json.parsedScenario || null;
        } else if (json.title && (json.bots || json.objectives)) {
          // It's a raw Scenario object!
          scenarioToUse = json;
          targetMarkdown = convertScenarioToMarkdown(json);
        } else {
          throw new Error('Invalid JSON structure: Must contain originalMarkdown or Scenario fields (title, objectives, bots).');
        }
        
        setMarkdown(targetMarkdown);
        if (scenarioToUse) {
          setParsedScenario(scenarioToUse);
        } else {
          const parsed = await onParseScenario(targetMarkdown);
          setParsedScenario(parsed);
        }
      } catch (err: any) {
        setError('JSON Import Error: ' + (err.message || 'Malformed JSON file.'));
        setParsedScenario(null);
      } finally {
        setIsParsing(false);
      }
    } else {
      // It's standard Markdown/text!
      setMarkdown(content);
      setIsParsing(true);
      try {
        const scenario = await onParseScenario(content);
        if (scenario) {
          setParsedScenario(scenario);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to parse scenario markdown.');
        setParsedScenario(null);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleExportJSON = () => {
    if (!parsedScenario) {
      setError('Cannot export: Please parse the scenario markdown successfully first.');
      return;
    }
    
    try {
      const exportPackage = {
        version: 'missi-scenario-v1',
        title: parsedScenario.title,
        description: parsedScenario.description,
        originalMarkdown: markdown,
        parsedScenario: parsedScenario,
        exportedAt: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `${parsedScenario.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_scenario.json`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Export failed: ' + err.message);
    }
  };

  const handleExportLibraryScenario = (item: ScenarioItem) => {
    try {
      const exportPackage = {
        version: 'missi-scenario-v1',
        title: item.title,
        description: item.description,
        originalMarkdown: item.originalMarkdown,
        parsedScenario: item.parsedScenario,
        exportedAt: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `${item.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_scenario.json`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Export failed: ' + err.message);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const content = event.target.result as string;
          await handleFileImportContent(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const content = event.target.result as string;
          await handleFileImportContent(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePresetSelect = (presetMarkdown: string) => {
    setMarkdown(presetMarkdown);
    setCurrentScenarioId(null);
    setLastSavedMarkdown(''); // Mark as unsaved so they can persist it as custom
    setShowPresets(false);
    setError(null);
  };

  const handleSpawn = async () => {
    if (!parsedScenario) return;
    setIsSpawning(true);
    setError(null);
    try {
      await onSpawnBots(parsedScenario);
    } catch (err: any) {
      setError(err.message || 'Failed to spawn bots.');
    } finally {
      setIsSpawning(false);
    }
  };

  // Compute state indicators dynamically
  const isDirty = markdown !== lastSavedMarkdown;
  const currentStatus = isSaving ? 'saving' : (saveFailed ? 'failed' : (isDirty ? 'dirty' : 'saved'));

  return (
    <div id="scenario-card" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Scenario Setup // PARSER</h2>
        </div>

        {/* Presets Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono uppercase font-bold rounded-none border border-brand-border hover:bg-brand-row text-brand-text transition-colors"
          >
            Presets Templates <ChevronDown className="w-3.5 h-3.5 text-brand-muted" />
          </button>
          {showPresets && (
            <div className="absolute right-0 mt-1 w-64 bg-brand-panel border border-brand-border rounded-none shadow-2xl z-50 py-1">
              {DEFAULT_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.title}
                  onClick={() => handlePresetSelect(scenario.markdown)}
                  className="w-full text-left px-3 py-2 text-xs text-brand-text hover:bg-brand-row transition-colors border-b border-brand-border/40 last:border-0"
                >
                  <div className="font-mono font-bold text-[11px] text-brand-green">{scenario.title}</div>
                  <div className="text-brand-muted truncate text-[9px] font-mono">{scenario.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-grow">
        {/* Editor & Library Left Column */}
        <div 
          className="flex flex-col h-full min-h-[300px]"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Sub-Tabs: Editor vs Library */}
          <div className="flex border border-brand-border bg-brand-panel p-1 rounded-none mb-3">
            <button
              onClick={() => setActiveSubTab('editor')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono font-bold tracking-wider uppercase rounded-none transition-all ${
                activeSubTab === 'editor'
                  ? 'bg-brand-border-light text-brand-text border border-brand-border'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" /> 01 // Editor
            </button>
            <button
              onClick={() => setActiveSubTab('library')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-mono font-bold tracking-wider uppercase rounded-none transition-all relative ${
                activeSubTab === 'library'
                  ? 'bg-brand-border-light text-brand-text border border-brand-border'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> 02 // Saved Library
              {savedScenarios.length > 0 && (
                <span className="absolute top-1.5 right-2 bg-brand-green text-brand-bg text-[8px] font-mono font-bold px-1 py-0.2 rounded-full leading-none">
                  {savedScenarios.length}
                </span>
              )}
            </button>
          </div>

          {activeSubTab === 'editor' ? (
            <div className="flex flex-col flex-grow">
              <div className="flex flex-col gap-1.5 mb-2.5">
                {/* Quick Load Dropdown */}
                <div className="flex items-center justify-between gap-2 p-2 bg-brand-panel border border-brand-border mb-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                    <span className="text-[10px] font-mono text-brand-text uppercase font-bold tracking-wider">Quick Load Template</span>
                  </div>
                  <select
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      if (selectedVal) {
                        const matched = COMPLEX_TEMPLATES.find(t => t.title === selectedVal);
                        if (matched) {
                          handlePresetSelect(matched.markdown);
                        }
                        e.target.value = '';
                      }
                    }}
                    className="bg-brand-bg text-[10px] font-mono text-brand-green border border-brand-border px-2.5 py-1 rounded-none focus:outline-none focus:border-brand-green min-w-[150px] font-bold cursor-pointer hover:border-brand-green transition-all"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Select Preset --</option>
                    {COMPLEX_TEMPLATES.map(t => (
                      <option key={t.title} value={t.title} className="text-brand-text bg-brand-panel">{t.title}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="block text-[9px] text-brand-muted uppercase font-mono italic">Scenario Markdown Source</label>
                  <div className="flex items-center gap-2">
                    {currentScenarioId === activeScenarioId && (
                      <span className="inline-flex items-center gap-1 text-[8px] text-brand-green font-mono uppercase bg-brand-green/20 border border-brand-green/40 px-1.5 py-0.5 font-bold">
                        [Active Workspace Scenario]
                      </span>
                    )}
                    {/* Status indicator */}
                    {currentStatus === 'saved' && (
                      <span className="inline-flex items-center gap-1 text-[8px] text-brand-green font-mono uppercase bg-brand-green/10 border border-brand-green/20 px-1.5 py-0.5 font-bold">
                        ● Saved {lastSavedAt ? `(${lastSavedAt})` : ''}
                      </span>
                    )}
                    {currentStatus === 'saving' && (
                      <span className="inline-flex items-center gap-1 text-[8px] text-yellow-500 font-mono uppercase bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 font-bold animate-pulse">
                        ● Saving...
                      </span>
                    )}
                    {currentStatus === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-[8px] text-red-500 font-mono uppercase bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 font-bold">
                        ● Save Failed
                      </span>
                    )}
                    {currentStatus === 'dirty' && (
                      <span className="inline-flex items-center gap-1 text-[8px] text-orange-500 font-mono uppercase bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 font-bold">
                        ● Unsaved Changes
                      </span>
                    )}
                  </div>
                </div>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative flex flex-col items-center justify-center border border-dashed border-brand-border hover:border-brand-green bg-brand-panel hover:bg-brand-row/50 p-4 rounded-none cursor-pointer text-center transition-all duration-200"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".md,.txt,.json"
                    className="hidden"
                  />
                  <Upload className="w-5 h-5 text-brand-muted group-hover:text-brand-green mb-1.5 group-hover:scale-110 transition-all duration-200" />
                  <div className="text-[10px] font-mono font-bold text-brand-text uppercase tracking-wider mb-0.5">
                    Drag & Drop Scenario (MD, TXT, JSON)
                  </div>
                  <div className="text-[9px] font-mono text-brand-muted">
                    or click to browse (.md, .txt, .json)
                  </div>
                </div>
              </div>
              <div className="relative flex-grow flex flex-col">
                <textarea
                  className={`w-full flex-grow text-xs font-mono bg-brand-bg border rounded-none p-3 text-brand-text focus:outline-none focus:border-brand-green resize-none h-[280px] transition-colors ${
                    isDragging ? 'border-brand-green bg-brand-green/5' : 'border-brand-border'
                  }`}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="# Scenario: My Adventure..."
                />
                {isDragging && (
                  <div className="absolute inset-0 bg-brand-bg/85 border-2 border-dashed border-brand-green flex flex-col items-center justify-center text-brand-green pointer-events-none">
                    <Upload className="w-8 h-8 animate-bounce mb-2" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">Drop scenario file here</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex justify-between items-center">
                <span className="text-[9px] font-mono text-brand-muted uppercase">
                  {currentScenarioId ? `Active ID: ${currentScenarioId}` : 'New Unsaved Scenario'}
                </span>
                <div className="flex gap-2">
                  {currentScenarioId ? (
                    <>
                      <button
                        onClick={() => handleSaveScenario(false)}
                        disabled={isSaving || isParsing}
                        className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green/20 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Save changes to current scenario"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {isSaving ? 'Saving...' : 'Update Current'}
                      </button>
                      <button
                        onClick={() => handleSaveScenario(true)}
                        disabled={isSaving || isParsing}
                        className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors disabled:opacity-50 cursor-pointer"
                        title="Save as a new scenario copy"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                        Save as New
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleSaveScenario(false)}
                      disabled={isSaving || isParsing}
                      className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green/20 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save Scenario'}
                    </button>
                  )}
                  <button
                    onClick={() => handleParseScenario(markdown)}
                    disabled={isParsing || isSaving}
                    className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-brand-muted" />
                    {isParsing ? 'Parsing...' : 'Parse Source'}
                  </button>
                  <button
                    onClick={handleExportJSON}
                    disabled={!parsedScenario || isSaving || isParsing}
                    className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green/20 transition-colors disabled:opacity-30 cursor-pointer"
                    title="Export current scenario as a local JSON file"
                  >
                    <Download className="w-3.5 h-3.5" /> Export JSON
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-grow h-full overflow-y-auto max-h-[420px] pr-1 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-brand-muted uppercase font-mono italic">Persistent Scenario Archive</span>
                <button 
                  onClick={fetchSavedScenarios}
                  className="text-[9px] font-mono text-brand-green hover:underline uppercase font-bold cursor-pointer"
                >
                  Reload Library
                </button>
              </div>

              {savedScenarios.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-brand-border text-brand-muted bg-brand-panel h-64">
                  <BookOpen className="w-6 h-6 mb-2 text-brand-border" />
                  <p className="text-xs font-mono">No scenarios saved yet.</p>
                  <p className="text-[9px] text-brand-muted mt-1 uppercase font-mono max-w-[180px] leading-tight">
                    Compose a scenario in the Editor, then click "Save Scenario" to register it.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedScenarios.map((scItem) => {
                    const isActiveWorkspace = activeScenario?.title === scItem.parsedScenario.title;
                    const isAppliedAndActive = appliedId === scItem.id || isActiveWorkspace;

                    return (
                      <div 
                        key={scItem.id} 
                        className={`border rounded-none p-3 bg-brand-panel transition-all ${
                          isAppliedAndActive 
                            ? 'border-brand-green bg-brand-green/5 shadow-[0_0_8px_rgba(46,213,115,0.15)]' 
                            : 'border-brand-border hover:border-brand-border-light'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-mono font-bold text-brand-text truncate">{scItem.title}</h4>
                              {isAppliedAndActive && (
                                <span className="text-[8px] text-brand-bg bg-brand-green font-mono uppercase font-bold px-1.5 py-0.2 shrink-0">
                                  Active Workspace
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-brand-muted mt-1 italic line-clamp-2">{scItem.description || 'No description.'}</p>
                            <div className="text-[9px] font-mono text-brand-muted mt-2 uppercase flex items-center justify-between">
                              <span>Saved: {new Date(scItem.lastSavedAt).toLocaleDateString()}</span>
                              <span className="text-brand-green font-bold">{scItem.parsedScenario.bots.length} Bots Registered</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-brand-border/40">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleLoadScenario(scItem)}
                              className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-bold uppercase border border-brand-border hover:bg-brand-row text-brand-text transition-colors cursor-pointer"
                              title="Load this scenario back into the markdown editor"
                            >
                              <Edit className="w-3 h-3 text-brand-green" /> Load
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportLibraryScenario(scItem);
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-bold uppercase border border-brand-border hover:bg-brand-row text-brand-text transition-colors cursor-pointer"
                              title="Export this saved scenario directly to a JSON file"
                            >
                              <Download className="w-3 h-3 text-brand-green" /> Export
                            </button>
                            <button
                              onClick={(e) => handleDeleteScenario(scItem.id, e)}
                              className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-bold uppercase border border-red-950/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors cursor-pointer"
                              title="Permanently delete from library"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>

                          <button
                            onClick={() => handleApplyScenario(scItem.id)}
                            disabled={isAppliedAndActive}
                            className={`flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-bold uppercase transition-colors rounded-none cursor-pointer ${
                              isAppliedAndActive
                                ? 'bg-brand-green/20 text-brand-green border border-brand-green/30 cursor-default'
                                : 'bg-brand-green text-brand-bg hover:opacity-90'
                            }`}
                          >
                            {isAppliedAndActive ? (
                              <>
                                <Check className="w-3 h-3" /> Applied
                              </>
                            ) : (
                              'Apply Workspace'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parsed & Validated Results Area */}
        <div className="bg-brand-bg border border-brand-border rounded-none p-4 flex flex-col justify-between h-full overflow-y-auto">
          {parsedScenario ? (
            <div className="space-y-4">
              <div>
                <span className="text-[9px] text-brand-green font-mono font-bold tracking-widest block mb-0.5">SCENARIO TITLE</span>
                <h3 className="text-xs font-mono font-bold text-brand-text">{parsedScenario.title}</h3>
                <p className="text-[11px] text-brand-muted mt-1 italic">{parsedScenario.description}</p>
              </div>

              <div>
                <span className="text-[9px] text-brand-green font-mono font-bold tracking-widest block mb-1">OBJECTIVES</span>
                <ul className="space-y-1">
                  {parsedScenario.objectives.map((obj, idx) => (
                    <li key={idx} className="text-xs text-brand-text font-mono flex items-start gap-1.5">
                      <span className="text-brand-green font-bold">//</span>
                      {obj}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-[9px] text-brand-green font-mono font-bold tracking-widest block mb-1">BOT SWARM REGISTRY ({parsedScenario.bots.length})</span>
                <div className="border border-brand-border rounded-none overflow-hidden bg-brand-panel">
                  <table className="w-full text-left text-[10px] text-brand-text font-mono">
                    <thead className="bg-brand-row border-b border-brand-border text-brand-muted">
                      <tr>
                        <th className="p-2 text-[9px] font-bold uppercase">Name</th>
                        <th className="p-2 text-[9px] font-bold uppercase">Role</th>
                        <th className="p-2 text-[9px] font-bold uppercase">Model</th>
                        <th className="p-2 text-[9px] font-bold uppercase text-right">Spawn / Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/30">
                      {parsedScenario.bots.map((bot) => (
                        <tr key={bot.id} className="hover:bg-brand-row">
                          <td className="p-2 font-bold text-brand-green">{bot.name}</td>
                          <td className="p-2 truncate max-w-[100px] text-brand-text">{bot.role}</td>
                          <td className="p-2 text-brand-muted">{bot.model}</td>
                          <td className="p-2 text-right">
                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1 sm:gap-2">
                              {onSaveBotToLibrary && (
                                <button
                                  onClick={() => onSaveBotToLibrary(bot)}
                                  className="text-[9px] text-brand-green hover:underline font-bold uppercase tracking-tight cursor-pointer"
                                  title="Save this agent config to your Bot Profile Library"
                                >
                                  Save Profile
                                </button>
                              )}
                              <span className="text-brand-muted text-[9px]">
                                [{bot.x},{bot.y},{bot.z}]
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedScenario.worldConfig && (
                <div className="bg-brand-panel border border-brand-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-brand-green font-mono font-bold tracking-widest uppercase">Detected World Settings</span>
                    <span className="text-[9px] font-mono text-brand-muted border border-brand-border px-1">AUTO-PARSED</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-brand-muted">
                    {parsedScenario.worldConfig.seed && <div>Seed: <strong className="text-brand-text">{parsedScenario.worldConfig.seed}</strong></div>}
                    {parsedScenario.worldConfig.gameMode && <div>Mode: <strong className="text-brand-text uppercase">{parsedScenario.worldConfig.gameMode}</strong></div>}
                    {parsedScenario.worldConfig.difficulty && <div>Diff: <strong className="text-brand-text uppercase">{parsedScenario.worldConfig.difficulty}</strong></div>}
                    {parsedScenario.worldConfig.port && <div>Port: <strong className="text-brand-text">{parsedScenario.worldConfig.port}</strong></div>}
                  </div>
                  {onApplyWorldConfig && serverStatus === 'stopped' && (
                    <button
                      onClick={async () => {
                        try {
                          if (onApplyWorldConfig && parsedScenario.worldConfig) {
                            await onApplyWorldConfig({
                              seed: parsedScenario.worldConfig.seed,
                              gameMode: parsedScenario.worldConfig.gameMode,
                              difficulty: parsedScenario.worldConfig.difficulty,
                              port: parsedScenario.worldConfig.port,
                            });
                            setApplySuccess(true);
                            setTimeout(() => setApplySuccess(false), 3000);
                          }
                        } catch (err: any) {
                          setError('Failed to apply configuration: ' + err.message);
                        }
                      }}
                      className="w-full text-center py-1 bg-brand-border hover:bg-brand-border-light text-brand-text border border-brand-border font-mono text-[9px] uppercase font-bold tracking-wider rounded-none cursor-pointer"
                    >
                      Apply settings to server host
                    </button>
                  )}
                  {applySuccess && (
                    <div className="text-[10px] text-brand-green font-mono uppercase font-bold text-center mt-1 animate-pulse">
                      ✓ Applied to Server Host!
                    </div>
                  )}
                </div>
              )}

              {serverStatus !== 'running' ? (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-none p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-yellow-400">
                    Bots compiled. Server offline. Launch Minecraft host to attach agents to lifecycle.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleSpawn}
                  disabled={isSpawning}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-none bg-brand-green text-brand-bg hover:opacity-90 font-mono font-bold text-xs uppercase transition-colors cursor-pointer"
                >
                  {isSpawning ? 'Attaching bots...' : 'Spawn & Attach Swarm'}
                </button>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-brand-muted border border-dashed border-brand-border rounded-none">
              <FileCode className="w-8 h-8 text-brand-border mb-2" />
              <p className="text-xs font-mono">No parsed scenario loaded.</p>
              <p className="text-[9px] text-brand-muted mt-1 max-w-[200px] font-mono uppercase tracking-tight">
                Paste Markdown on the left or select a preset, then run parser
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-500/5 border border-red-500/20 text-red-400 text-xs p-3 rounded-none flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

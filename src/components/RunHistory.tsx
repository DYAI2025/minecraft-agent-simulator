import React, { useState, useEffect } from 'react';
import { RunManifest } from '../types/index.js';
import { History, Eye, CheckCircle, XCircle, AlertCircle, RefreshCw, Download } from 'lucide-react';

interface RunHistoryProps {
  onLoadHistoryList: () => Promise<{ id: string; startTime: string; scenarioTitle: string; status: string }[]>;
  onLoadRunDetails: (id: string) => Promise<RunManifest | null>;
}

export const RunHistory: React.FC<RunHistoryProps> = ({
  onLoadHistoryList,
  onLoadRunDetails,
}) => {
  const [runs, setRuns] = useState<{ id: string; startTime: string; scenarioTitle: string; status: string }[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunManifest | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const handleDeleteRun = async (id: string) => {
    try {
      setDeleteErrorMessage(null);
      const res = await fetch(`/api/simulation/runs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedRun(null);
        setConfirmDeleteId(null);
        await fetchRuns();
      } else {
        const data = await res.json();
        setDeleteErrorMessage(data.error || 'Failed to delete run.');
      }
    } catch (err: any) {
      console.error('Failed to delete run:', err);
      setDeleteErrorMessage(err.message || 'Network error deleting run.');
    }
  };

  const handleClearAllRuns = async () => {
    try {
      setDeleteErrorMessage(null);
      const res = await fetch('/api/simulation/runs', { method: 'DELETE' });
      if (res.ok) {
        setSelectedRun(null);
        setConfirmClearAll(false);
        await fetchRuns();
      } else {
        const data = await res.json();
        setDeleteErrorMessage(data.error || 'Failed to clear runs.');
      }
    } catch (err: any) {
      console.error('Failed to clear runs:', err);
      setDeleteErrorMessage(err.message || 'Network error clearing runs.');
    }
  };

  const fetchRuns = async () => {
    setIsLoadingList(true);
    try {
      const list = await onLoadHistoryList();
      setRuns(list);
    } catch (err) {
      console.error('Failed to load runs:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleSelectRun = async (id: string) => {
    setIsLoadingDetail(true);
    try {
      const details = await onLoadRunDetails(id);
      setSelectedRun(details);
    } catch (err) {
      console.error('Failed to load run details:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!selectedRun) return;
    try {
      const dataStr = JSON.stringify(selectedRun.logs, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedRun.id}_logs.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON logs:', err);
    }
  };

  const handleDownloadCSV = () => {
    if (!selectedRun) return;
    try {
      const headers = ['Timestamp', 'Type', 'Bot Name', 'Message'];
      const rows = selectedRun.logs.map(log => [
        new Date(log.timestamp).toISOString(),
        log.type || '',
        log.botName || '',
        log.message || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedRun.id}_logs.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV logs:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-brand-green" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <AlertCircle className="w-4 h-4 text-amber-400 animate-pulse" />;
    }
  };

  return (
    <div id="run-history" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Historical Audit Logs // VERIFY</h2>
        </div>
        <div className="flex items-center gap-2">
          {confirmClearAll ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-red-400 font-bold uppercase tracking-wider">Confirm?</span>
              <button
                onClick={handleClearAllRuns}
                className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-none bg-red-600 text-brand-text border border-red-700 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-none bg-brand-border text-brand-text border border-brand-border hover:bg-brand-border-light transition-colors"
              >
                No
              </button>
            </div>
          ) : runs.length > 0 ? (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-none bg-red-950/20 text-red-400 border border-red-900/50 hover:bg-red-950/40 hover:text-red-300 transition-colors"
            >
              Clear All
            </button>
          ) : null}
          <button
            onClick={fetchRuns}
            disabled={isLoadingList}
            className="p-1 border border-brand-border bg-brand-bg text-brand-muted hover:text-brand-text hover:bg-brand-border-light rounded-none transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow">
        {/* Run list */}
        <div className="lg:col-span-1 space-y-2 overflow-y-auto max-h-[350px] pr-2">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider block mb-1.5 font-bold">// MANIFESTS_INDEX</span>
          {runs.length > 0 ? (
            runs.map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run.id)}
                className={`w-full text-left p-3 rounded-none border text-xs transition-all flex items-center justify-between font-mono ${
                  selectedRun?.id === run.id
                    ? 'bg-brand-green/10 border-brand-green text-brand-text'
                    : 'bg-brand-bg hover:bg-brand-border-light border-brand-border text-brand-muted hover:text-brand-text'
                }`}
              >
                <div className="space-y-1 truncate max-w-[80%]">
                  <div className="font-bold text-brand-text truncate uppercase">{run.scenarioTitle}</div>
                  <div className="text-[9px] opacity-60 font-mono text-brand-muted">{new Date(run.startTime).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {getStatusIcon(run.status)}
                </div>
              </button>
            ))
          ) : (
            <div className="text-center p-6 text-brand-muted italic text-[10px] border border-dashed border-brand-border rounded-none uppercase font-mono">
              No historical runs captured.
            </div>
          )}
        </div>

        {/* Detailed audit logs */}
        <div className="lg:col-span-2 flex flex-col bg-brand-bg border border-brand-border rounded-none overflow-hidden min-h-[300px]">
          {isLoadingDetail ? (
            <div className="h-full flex items-center justify-center text-brand-muted py-16 font-mono text-[10px] uppercase gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-green" /> Reading run manifest details...
            </div>
          ) : selectedRun ? (
            <div className="flex flex-col h-full">
              {/* Manifest Metadata */}
              <div className="bg-brand-panel border-b border-brand-border p-3.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[9px] font-mono text-brand-green font-bold uppercase">MANIFEST_ID // {selectedRun.id}</h3>
                    <h2 className="text-xs font-bold text-brand-text mt-1 uppercase font-mono">{selectedRun.scenarioTitle}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] font-mono font-bold border rounded-none px-1.5 py-0.5 ${
                      selectedRun.status === 'completed' ? 'bg-brand-green/10 text-brand-green border-brand-green/30' : 'bg-red-950/40 text-red-300 border-red-800/40'
                    }`}>
                      {selectedRun.status.toUpperCase()}
                    </span>
                    {confirmDeleteId === selectedRun.id ? (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[8px] font-mono text-red-400 font-bold uppercase">Confirm?</span>
                        <button
                          onClick={() => handleDeleteRun(selectedRun.id)}
                          className="text-[8px] font-mono font-bold uppercase px-1 py-0.5 rounded-none bg-red-600 text-brand-text border border-red-700 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[8px] font-mono font-bold uppercase px-1 py-0.5 rounded-none bg-brand-border text-brand-text border border-brand-border hover:bg-brand-border-light transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(selectedRun.id)}
                        className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 mt-1 rounded-none bg-red-950/20 text-red-400 border border-red-900/40 hover:bg-red-950/40 hover:text-red-300 transition-all"
                      >
                        Delete Run
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] text-brand-muted mt-2.5 font-mono uppercase">
                  <div>Started: {new Date(selectedRun.startTime).toLocaleString()}</div>
                  {selectedRun.endTime && (
                    <div>Ended: {new Date(selectedRun.endTime).toLocaleString()}</div>
                  )}
                  <div>Seed: {selectedRun.serverConfig.seed}</div>
                  <div>Events Count: {selectedRun.logs.length}</div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-border">
                  <span className="text-[9px] font-mono text-brand-muted uppercase font-bold tracking-wider">Download Logs:</span>
                  <button
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-2 py-1 rounded-none bg-brand-border text-brand-text border border-brand-border hover:bg-brand-border-light hover:text-brand-green transition-all"
                  >
                    <Download className="w-3 h-3 text-brand-green" /> JSON
                  </button>
                  <button
                    onClick={handleDownloadCSV}
                    className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-2 py-1 rounded-none bg-brand-border text-brand-text border border-brand-border hover:bg-brand-border-light hover:text-brand-green transition-all"
                  >
                    <Download className="w-3 h-3 text-brand-green" /> CSV
                  </button>
                </div>
                {deleteErrorMessage && (
                  <div className="mt-2.5 p-1.5 bg-red-950/40 border border-red-500/30 text-[9px] font-mono text-red-400">
                    {deleteErrorMessage}
                  </div>
                )}
              </div>

              {/* Historical logs list */}
              <div className="p-3.5 overflow-y-auto max-h-[300px] text-[10px] font-mono space-y-1.5 bg-brand-bg">
                {selectedRun.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-brand-text leading-relaxed">
                    <span className="text-[9px] text-brand-muted select-none shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-brand-green font-bold shrink-0">
                      [{log.type.toUpperCase()}]
                    </span>
                    {log.botName && (
                      <span className="text-purple-400 font-bold shrink-0">
                        [{log.botName}]
                      </span>
                    )}
                    <span className="break-all whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-brand-muted italic text-center py-20 text-[10px] uppercase font-mono">
              <Eye className="w-6 h-6 text-brand-border mb-2" />
              <span>Select completed run manifest to inspect audit logs</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export interface ConfigStatus {
  claudeApiConfigured: boolean;
  whoopConfigured: boolean;
  ouraConfigured: boolean;
  appleIngestConfigured: boolean;
  mcp: {
    serverName: string;
    transport: 'stdio';
    paths: {
      repoRoot: string;
      mcpSource: string;
      mcpDist: string | null;
      dbPath: string;
      tsxBin: string | null;
      nodeBin: string;
      mode: 'dev' | 'prod';
    };
    claudeDesktopConfig: {
      snippet: string;
      command: string;
      args: string[];
    };
  };
}

export function useConfigStatus() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  useEffect(() => {
    apiGet<ConfigStatus>('/api/config/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return status;
}

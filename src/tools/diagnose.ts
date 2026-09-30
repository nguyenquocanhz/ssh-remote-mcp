import { HostTarget } from '../types.js';
import { MatlockSessionPool } from '../core/session-pool.js';
import { MatlockForensics } from '../core/forensics.js';

export interface HostDiagnoseArgs {
  target?: HostTarget;
}

export interface HostDiagnosticReport {
  target: string;
  os: string;
  kernel: string;
  uptime: string;
  loadAverage: string;
  memoryMb: {
    total: number;
    used: number;
    free: number;
    available: number;
  };
  diskUsage: string[];
  listeningPorts: string[];
  dockerContainers?: Array<{
    id: string;
    image: string;
    status: string;
    names: string;
    ports: string;
  }>;
  topProcesses: string[];
  collectedAt: string;
}

export async function handleSshHostDiagnose(args: HostDiagnoseArgs): Promise<HostDiagnosticReport> {
  const target = args.target || {};
  const client = await MatlockSessionPool.getClient(target);

  // Single composite probe script for maximum speed and minimal latency
  const probeScript = `
echo "===OS==="
cat /etc/os-release 2>/dev/null || cat /etc/issue 2>/dev/null || echo "NAME=Linux"
echo "===UNAME==="
uname -srm
echo "===UPTIME==="
uptime
echo "===FREE==="
free -m
echo "===DF==="
df -h -x tmpfs -x devtmpfs -x overlay
echo "===PORTS==="
(ss -tulpn 2>/dev/null || netstat -tuln 2>/dev/null) | head -n 30
echo "===DOCKER==="
if command -v docker >/dev/null 2>&1; then
  docker ps --format "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}\t{{.Ports}}" 2>/dev/null || echo "DOCKER_NO_PERM"
else
  echo "DOCKER_NOT_INSTALLED"
fi
echo "===TOP_PROC==="
ps aux --sort=-%cpu | head -n 6
`;

  const res = await MatlockForensics.executeRaw(client, probeScript, { timeoutMs: 15000 });
  const text = res.stdout;

  const extractSection = (tag: string): string => {
    const startTag = `===${tag}===`;
    const startIndex = text.indexOf(startTag);
    if (startIndex === -1) return '';
    const slice = text.slice(startIndex + startTag.length);
    const nextTagIndex = slice.indexOf('===');
    return (nextTagIndex === -1 ? slice : slice.slice(0, nextTagIndex)).trim();
  };

  // 1. OS & Kernel
  const osRaw = extractSection('OS');
  let osName = 'Linux';
  const prettyMatch = osRaw.match(/PRETTY_NAME="?([^"\n]+)"?/);
  if (prettyMatch) osName = prettyMatch[1];
  const kernel = extractSection('UNAME') || 'Unknown';

  // 2. Uptime
  const uptime = extractSection('UPTIME') || '';
  const loadMatch = uptime.match(/load average:\s*(.+)$/);
  const loadAverage = loadMatch ? loadMatch[1] : 'N/A';

  // 3. Memory
  const freeRaw = extractSection('FREE');
  const memoryMb = { total: 0, used: 0, free: 0, available: 0 };
  const memLines = freeRaw.split('\n');
  for (const line of memLines) {
    if (line.startsWith('Mem:')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 7) {
        memoryMb.total = parseInt(parts[1], 10) || 0;
        memoryMb.used = parseInt(parts[2], 10) || 0;
        memoryMb.free = parseInt(parts[3], 10) || 0;
        memoryMb.available = parseInt(parts[6], 10) || 0;
      }
    }
  }

  // 4. Disk
  const dfRaw = extractSection('DF');
  const diskUsage = dfRaw.split('\n').filter(l => l.trim().length > 0);

  // 5. Ports
  const portsRaw = extractSection('PORTS');
  const listeningPorts = portsRaw.split('\n').filter(l => l.trim().length > 0);

  // 6. Docker
  const dockerRaw = extractSection('DOCKER');
  let dockerContainers: any[] | undefined = undefined;
  if (!dockerRaw.includes('DOCKER_NOT_INSTALLED') && !dockerRaw.includes('DOCKER_NO_PERM')) {
    dockerContainers = [];
    const lines = dockerRaw.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        dockerContainers.push({
          id: parts[0],
          image: parts[1],
          status: parts[2],
          names: parts[3],
          ports: parts[4] || '',
        });
      }
    }
  }

  // 7. Top Processes
  const procRaw = extractSection('TOP_PROC');
  const topProcesses = procRaw.split('\n').filter(l => l.trim().length > 0);

  return {
    target: MatlockSessionPool.getSessionKey(target),
    os: osName,
    kernel,
    uptime,
    loadAverage,
    memoryMb,
    diskUsage,
    listeningPorts,
    dockerContainers,
    topProcesses,
    collectedAt: new Date().toISOString(),
  };
}

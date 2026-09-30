import fs from 'fs';
import path from 'path';

const schemaDir = 'C:\\Users\\ACER\\.gemini\\antigravity\\mcp\\ssh-remote-mcp';

const TARGET_SCHEMA = {
  type: 'object',
  description: 'Optional SSH connection target. If omitted, uses default profile (homelab).',
  properties: {
    profile: { type: 'string', description: 'Named host profile (e.g. "homelab")' },
    host: { type: 'string', description: 'Remote host IP or hostname' },
    port: { type: 'number', description: 'SSH port (default 22)' },
    username: { type: 'string', description: 'SSH login username' },
    privateKeyPath: { type: 'string', description: 'Local path to private key file (e.g. ~/.ssh/acer-nitro)' },
    password: { type: 'string', description: 'Optional password' },
  },
};

const tools = [
  {
    name: 'ssh_exec',
    description: 'Execute shell command on remote host with Matlock 3-Tier blast-radius containment and post-flight state assertions (verifies listening ports, process liveness, file existence). Blocks destructive operations unless confirmed.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact shell command to execute.' },
        target: TARGET_SCHEMA,
        workingDir: { type: 'string', description: 'Remote directory to cd into prior to command.' },
        timeoutMs: { type: 'number', description: 'Timeout in ms (default 60000ms).' },
        confirmDangerToken: { type: 'boolean', description: 'Must be true to execute Tier 3 destructive operations (e.g. root rm -rf, reboot, mkfs).' },
        assertions: {
          type: 'object',
          description: 'Optional forensic post-flight assertions.',
          properties: {
            assertPortListening: {
              oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }],
              description: 'Port or array of ports that must be actively listening after execution.',
            },
            assertProcessRunning: { type: 'string', description: 'Process pattern that must be found in pgrep after execution.' },
            assertFileExists: { type: 'string', description: 'File path that must exist after execution.' },
            assertHttpEndpoint: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                expectedStatus: { type: 'number' },
                timeoutSeconds: { type: 'number' },
              },
              required: ['url'],
            },
          },
        },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Optional environment variables to pass into remote process.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'ssh_exec_background',
    description: 'Launch long-running command in a detached background subshell (avoids client timeout). Returns a taskId to poll logs and status.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Long-running command (e.g. docker compose build, npm build).' },
        target: TARGET_SCHEMA,
        workingDir: { type: 'string', description: 'Remote working directory.' },
        taskTag: { type: 'string', description: 'Human-readable tag prefix for taskId (e.g. "deploy", "cronjob").' },
      },
      required: ['command'],
    },
  },
  {
    name: 'ssh_task_poll',
    description: 'Check status, exit code, and inspect log tail of a background task launched via ssh_exec_background.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The taskId returned by ssh_exec_background.' },
        target: TARGET_SCHEMA,
        tailLines: { type: 'number', description: 'Number of log lines to tail (default 50).' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'ssh_task_kill',
    description: 'Terminate or signal a running background task by taskId.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The taskId to terminate.' },
        target: TARGET_SCHEMA,
        signal: { type: 'string', enum: ['SIGTERM', 'SIGKILL'], description: 'Termination signal (default SIGTERM).' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'sftp_read_file',
    description: 'Safely read remote file with line range slicing (startLine/endLine) and SHA-256 integrity checksum.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute remote file path.' },
        target: TARGET_SCHEMA,
        startLine: { type: 'number', description: '1-indexed starting line.' },
        endLine: { type: 'number', description: '1-indexed ending line.' },
        maxBytes: { type: 'number', description: 'Max bytes to read.' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'sftp_write_safe',
    description: 'Safe atomic remote file write: creates automated remote backup (.matlock.bak.<timestamp>), writes atomically, and returns a unified diff patch and SHA-256 hashes.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute remote file path to write.' },
        content: { type: 'string', description: 'Complete content to write into file.' },
        target: TARGET_SCHEMA,
        createBackup: { type: 'boolean', description: 'Whether to create .matlock.bak snapshot (default true).' },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'sftp_rollback_file',
    description: 'Instantly rollback a modified remote file to its previous .matlock.bak snapshot.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute remote file path to restore.' },
        backupPath: { type: 'string', description: 'Specific backup file path (if omitted, uses .matlock.bak.latest).' },
        target: TARGET_SCHEMA,
      },
      required: ['filePath'],
    },
  },
  {
    name: 'sftp_list_dir',
    description: 'List remote directory entries with structured file metadata (type, permissions, owner, size, modified date).',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Absolute remote directory path.' },
        target: TARGET_SCHEMA,
      },
      required: ['dirPath'],
    },
  },
  {
    name: 'ssh_host_diagnose',
    description: 'Comprehensive host telemetry snapshot in a single round-trip: OS, Kernel, Uptime, Load Avg, RAM, Disk, Docker containers, Listening Ports, and Top Processes.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        target: TARGET_SCHEMA,
      },
    },
  },
  {
    name: 'ssh_profile_manage',
    description: 'List, save, or remove saved SSH host profiles in ~/.matlock/profiles.json.',
    parameters: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'save', 'delete'], description: 'Action to perform.' },
        profile: {
          type: 'object',
          description: 'Profile data (required if action is save).',
          properties: {
            name: { type: 'string' },
            host: { type: 'string' },
            port: { type: 'number' },
            username: { type: 'string' },
            privateKeyPath: { type: 'string' },
            description: { type: 'string' },
            defaultWorkingDir: { type: 'string' },
          },
        },
        profileName: { type: 'string', description: 'Profile name (required if action is delete).' },
      },
      required: ['action'],
    },
  },
];

for (const tool of tools) {
  const filePath = path.join(schemaDir, `${tool.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(tool, null, 2), 'utf8');
  console.log(`Generated: ${filePath}`);
}

console.log('All schemas exported successfully!');

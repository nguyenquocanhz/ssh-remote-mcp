#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { handleSshExec } from './tools/exec.js';
import {
  handleSshExecBackground,
  handleSshTaskPoll,
  handleSshTaskKill,
} from './tools/background-task.js';
import {
  handleSftpReadFile,
  handleSftpWriteSafe,
  handleSftpRollbackFile,
  handleSftpListDir,
} from './tools/sftp.js';
import { handleSshHostDiagnose } from './tools/diagnose.js';
import {
  handleProfileList,
  handleProfileSave,
  handleProfileDelete,
} from './tools/profile.js';
import { MatlockSessionPool } from './core/session-pool.js';
import { handleSshKeyBootstrap } from './tools/bootstrap.js';
import { McpAutoInstaller } from './installer/auto-installer.js';
import { runInstallerCli } from './installer/cli.js';

const server = new Server(
  {
    name: 'ssh-remote-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const TARGET_SCHEMA = {
  type: 'object',
  description: 'Optional SSH connection target. If omitted, uses default profile (homelab).',
  properties: {
    profile: { type: 'string', description: 'Named host profile (e.g. "homelab")' },
    host: { type: 'string', description: 'Remote host IP or hostname' },
    port: { type: 'number', description: 'SSH port (default 22)' },
    username: { type: 'string', description: 'SSH login username' },
    privateKeyPath: { type: 'string', description: 'Local path to private key file (e.g. ~/.ssh/acer-nitro)' },
    password: { type: 'string', description: 'Optional password (key authentication preferred)' },
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ssh_exec',
        description: 'Execute shell command on remote host with Matlock 3-Tier blast-radius containment and post-flight state assertions (verifies listening ports, process liveness, file existence). Blocks destructive operations unless confirmed.',
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
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
        inputSchema: {
          type: 'object',
          properties: {
            target: TARGET_SCHEMA,
          },
        },
      },
      {
        name: 'ssh_profile_manage',
        description: 'List, save, or remove saved SSH host profiles in ~/.matlock/profiles.json.',
        inputSchema: {
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
      {
        name: 'mcp_auto_install',
        description: 'Automatically detect and install/configure ssh-remote-mcp (or any MCP server) into all Agent IDEs on this computer (Claude Desktop, VS Code, Cursor, Windsurf, Antigravity, Cline, Roo Code, Zed, Continue).',
        inputSchema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['local', 'npx'], description: 'Installation mode: local node script or global npx (default: local)' },
            forceAll: { type: 'boolean', description: 'Force install into all supported IDEs even if directory does not yet exist.' },
            targetIdeIds: { type: 'array', items: { type: 'string' }, description: 'Optional list of specific IDE IDs to target (e.g. ["claude", "vscode", "cursor", "gemini"]).' },
            dryRun: { type: 'boolean', description: 'Preview installation without writing changes.' },
          },
        },
      },
      {
        name: 'ssh_key_bootstrap',
        description: '1-Click SSH Key Bootstrap: If you only have a VPS password, this tool automatically generates a local SSH key pair, connects via password, securely installs the public key into ~/.ssh/authorized_keys, verifies key-based login, and saves a named profile so you never need to use passwords again.',
        inputSchema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'VPS IP address or domain name.' },
            port: { type: 'number', description: 'SSH port (default: 22).' },
            username: { type: 'string', description: 'SSH user (default: "root").' },
            password: { type: 'string', description: 'Temporary VPS root or user password.' },
            keyName: { type: 'string', description: 'Local key name (default: "matlock_ed25519").' },
            profileName: { type: 'string', description: 'Name for the saved profile (e.g. "my-vps").' },
          },
          required: ['host', 'password'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args || {}) as any;

  try {
    let resultData: any;

    switch (name) {
      case 'ssh_exec':
        resultData = await handleSshExec(toolArgs);
        break;

      case 'ssh_exec_background':
        resultData = await handleSshExecBackground(toolArgs);
        break;

      case 'ssh_task_poll':
        resultData = await handleSshTaskPoll(toolArgs);
        break;

      case 'ssh_task_kill':
        resultData = await handleSshTaskKill(toolArgs);
        break;

      case 'sftp_read_file':
        resultData = await handleSftpReadFile(toolArgs);
        break;

      case 'sftp_write_safe':
        resultData = await handleSftpWriteSafe(toolArgs);
        break;

      case 'sftp_rollback_file':
        resultData = await handleSftpRollbackFile(toolArgs);
        break;

      case 'sftp_list_dir':
        resultData = await handleSftpListDir(toolArgs);
        break;

      case 'ssh_host_diagnose':
        resultData = await handleSshHostDiagnose(toolArgs);
        break;

      case 'ssh_profile_manage':
        if (toolArgs.action === 'list') {
          resultData = handleProfileList();
        } else if (toolArgs.action === 'save') {
          if (!toolArgs.profile) throw new Error('profile data is required for save action');
          resultData = handleProfileSave(toolArgs.profile);
        } else if (toolArgs.action === 'delete') {
          if (!toolArgs.profileName) throw new Error('profileName is required for delete action');
          resultData = handleProfileDelete(toolArgs.profileName);
        } else {
          throw new Error(`Unknown profile action: ${toolArgs.action}`);
        }
        break;

      case 'mcp_auto_install':
        resultData = McpAutoInstaller.install({
          mode: toolArgs.mode || 'local',
          forceAll: toolArgs.forceAll === true,
          targetIdeIds: toolArgs.targetIdeIds,
          dryRun: toolArgs.dryRun === true,
        });
        break;

      case 'ssh_key_bootstrap':
        resultData = await handleSshKeyBootstrap(toolArgs);
        break;

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultData, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `[Matlock SSH Error] ${error.message || String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Clean up connections on process termination
process.on('SIGINT', () => {
  MatlockSessionPool.closeAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  MatlockSessionPool.closeAll();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Check if running as installer CLI or MCP server
const cliArgs = process.argv.slice(2);
const installerCommands = ['install', 'setup', 'list', '--list', '-h', '--help'];
if (cliArgs.length > 0 && installerCommands.some((cmd) => cliArgs.includes(cmd))) {
  runInstallerCli(cliArgs);
} else {
  main().catch((err) => {
    console.error('Fatal MCP Server Error:', err);
    process.exit(1);
  });
}

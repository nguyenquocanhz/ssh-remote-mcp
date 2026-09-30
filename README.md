# 🛡️ SSH Remote MCP — Matlock Edition

> **"Never trust raw command piping. Verify state forensically. Contain the blast radius."**  
> An enterprise-grade Model Context Protocol (MCP) server engineered with Grab's **Matlock Agent Mindset** for safe, deterministic, and audited remote infrastructure management.

---

## ⚡ The Problem with Commodity SSH MCPs

Traditional SSH MCPs treat the remote server like a dumb `stdin/stdout` pipe:
1. **Blind Execution / Command Injection**: Raw multiline scripts and unescaped quotes corrupt remote configuration files or cause hanging heredocs.
2. **Zero Blast-Radius Control**: A hallucinated `rm -rf /` or recursive permission change runs unconditionally, permanently bricking nodes.
3. **No Forensic Verification**: Commands returning exit code `0` are assumed successful, even when background services fail to bind ports or immediately enter crash loops.
4. **Dangerous Remote File Mutations**: Overwriting remote files without backup snapshots or unified diff inspection leads to silent data loss.
5. **Session Hanging on Long Tasks**: Builds, container pulls, or migrations cause client stdio timeouts.

---

## 🏛️ The Matlock Architecture

```
                       ┌────────────────────────────────────────┐
                       │           AI Agent / Client            │
                       └───────────────────┬────────────────────┘
                                           │ JSON-RPC (MCP)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SSH REMOTE MCP                                         │
│                                                                                        │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │ 3-Tier Blast Radius   │  │   Forensic Assertion    │  │   Safe SFTP Engine      │  │
│  │     Containment       │  │         Engine          │  │  (Atomic + Diff + Roll) │  │
│  │                       │  │                         │  │                         │  │
│  │ • Tier 1: Safe Read   │  │ • Port Listening Verify │  │ • Auto .matlock.bak     │  │
│  │ • Tier 2: Mutating    │  │ • Process Liveness Check│  │ • Base64 Safe Transfer  │  │
│  │ • Tier 3: Block/Gate  │  │ • File State Check      │  │ • Unified Git Diffs     │  │
│  │   (Safety Bypass Tkn) │  │ • HTTP Health Probe     │  │ • 1-Click Rollback      │  │
│  └───────────────────────┘  └─────────────────────────┘  └─────────────────────────┘  │
│                                                                                        │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────────────────┐     │
│  │   Background Task Envelope       │  │     Multiplexed Session & Profile Store │     │
│  │   (Detached + Poll + Kill)       │  │     (~/.matlock/profiles.json)          │     │
│  └──────────────────────────────────┘  └─────────────────────────────────────────┘     │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ SSH2 / SFTP Keepalive Pool
                                           ▼
                                 ┌───────────────────┐
                                 │    Remote Host    │
                                 │ (Homelab / Cloud) │
                                 └───────────────────┘
```

---

## 🧰 Available Tools (10 Primitives)

### 1. Command Execution & Telemetry
| Tool | Description | Matlock Feature |
| :--- | :--- | :--- |
| `ssh_exec` | Executes shell commands on remote target. | 3-Tier classification (`TIER_1_SAFE`, `TIER_2_MUTATING`, `TIER_3_DESTRUCTIVE`), post-flight assertions, exit-code validation. |
| `ssh_host_diagnose` | Gathers a full forensic host telemetry snapshot. | OS, kernel, uptime, load avg, memory (MB), disk usage, Docker containers, listening ports, top processes in 1 roundtrip. |

### 2. Long-Running Task Envelope
| Tool | Description | Matlock Feature |
| :--- | :--- | :--- |
| `ssh_exec_background` | Detaches long tasks into background runner subshells. | Generates task ID, runner script, captures exit codes to disk without hanging MCP stdio. |
| `ssh_task_poll` | Polls background task status. | Process liveness check, exit code inspection, and real-time log tailing. |
| `ssh_task_kill` | Signals or terminates background task. | Supports `SIGTERM` / `SIGKILL` cleanly. |

### 3. Safe Atomic SFTP Primitives
| Tool | Description | Matlock Feature |
| :--- | :--- | :--- |
| `sftp_read_file` | Reads file content with line slicing. | Line range parameters (`startLine`, `endLine`), SHA-256 integrity hash. |
| `sftp_write_safe` | Atomic file write with automatic backup. | Creates `.matlock.bak.<timestamp>`, base64 transfer, atomic swap, and returns a **Unified Diff** (`diff -u`). |
| `sftp_rollback_file` | Restores modified file from backup. | Atomic restoration from `.matlock.bak.latest` or specific backup. |
| `sftp_list_dir` | Structured directory file explorer. | Parsed permissions, owner, size, and modification timestamps. |

### 4. Profile & Credential Isolation
| Tool | Description | Matlock Feature |
| :--- | :--- | :--- |
| `ssh_profile_manage` | Manages saved hosts in `~/.matlock/profiles.json`. | Zero raw private key transmission across MCP parameters; references credentials securely by profile name. |

---

## 🔒 3-Tier Blast Radius Containment

* **Tier 1 (Safe / Telemetry)**: Read-only inspection (`ls`, `cat`, `df`, `free`, `ps`, `docker ps`, `ss`). Automatically executed.
* **Tier 2 (Mutating)**: System mutations (`mkdir`, `systemctl restart`, `docker compose up -d`, `apt install`). Executed with pre/post flight forensic assertions.
* **Tier 3 (Destructive)**: High-risk operations (`rm -rf /`, `mkfs`, `dd to /dev/sd*`, `shutdown`, `reboot`, `iptables -F`, `kill -9 1`). **Interpreted and BLOCKED before transmission** unless explicit `confirmDangerToken: true` is supplied.

---

## 🚀 Installation & Configuration

### Prerequisites
- Node.js >= 18
- SSH Key configured on host (e.g. `~/.ssh/acer-nitro`)

### Register with Antigravity / Claude Desktop

**Cách 1: Chạy trực tiếp qua NPX từ GitHub (Khuyên dùng):**
```json
{
  "mcpServers": {
    "ssh-remote-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:nguyenquocanhz/ssh-remote-mcp"
      ]
    }
  }
}
```

**Cách 2: Chạy từ source code cục bộ:**
```bash
cd D:\ssh-remote-mcp
npm install
npm run build
```
Cấu hình trong `mcp_config.json`:
```json
{
  "mcpServers": {
    "ssh-remote-mcp": {
      "command": "node",
      "args": [
        "D:\\ssh-remote-mcp\\dist\\index.js"
      ]
    }
  }
}
```

---

## 🧪 Verification & Evidence

Run the integrated automated forensic test suite:
```bash
node test-matlock.js
```

Verified against Homelab Node (`192.168.100.169`):
- ✅ `ssh_host_diagnose`: OS Ubuntu 24.04.5 LTS, 15 Docker containers detected (`zaloapp-backend` healthy on port 8088).
- ✅ `ssh_exec`: Post-flight assertions verified Port 8088 listening and `cloudflared` active.
- ✅ Blast-Radius: Destructive `rm -rf /` blocked by Matlock guardrails.
- ✅ Safe SFTP: Atomic backup created, unified diff generated, rolled back cleanly.
- ✅ Background Envelope: Detached runner script executed `for loop`, polled output, and returned exit code 0.

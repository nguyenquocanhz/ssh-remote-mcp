// Destructive patterns that could brick systems, delete critical data, or kill networking
const TIER_3_PATTERNS = [
    {
        regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|--recursive)\s+(\/|\/\*|\/etc|\/boot|\/bin|\/sbin|\/usr|\/var|\/lib|~|\$HOME|\.\.)(\s|$)/,
        reason: 'Critical root or system directory deletion detected (rm -rf root/system path)',
    },
    {
        regex: /\bmkfs(\.[a-zA-Z0-9]+)?\s+/,
        reason: 'Filesystem formatting command detected (mkfs)',
    },
    {
        regex: /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]n[0-9]|vd[a-z]|hd[a-z])\b/,
        reason: 'Raw block device overwrite detected (dd to disk)',
    },
    {
        regex: /\b(shutdown|poweroff|init\s+0|halt)(\s|$)/,
        reason: 'System shutdown/poweroff command detected',
    },
    {
        regex: /\b(reboot|init\s+6)(\s|$)/,
        reason: 'System reboot command detected',
    },
    {
        regex: /\biptables\s+(-F|--flush)\b/,
        reason: 'Firewall rules flush detected - high risk of permanent SSH lockout',
    },
    {
        regex: /\bufw\s+enable\b/,
        reason: 'UFW enablement detected without verifying SSH port rule - risk of lockout',
    },
    {
        regex: /\b(chmod|chown)\s+(-R|--recursive)\s+(777|000)\s+(\/|\/\*|\/etc|\/root)(\s|$)/,
        reason: 'Dangerous root-level blanket permission mutation detected',
    },
    {
        regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
        reason: 'Fork bomb signature detected',
    },
    {
        regex: /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i,
        reason: 'Raw database destruction query detected in command line',
    },
    {
        regex: /\bkill\s+-9\s+1\b/,
        reason: 'Attempt to force kill PID 1 (init/systemd) detected',
    },
];
// Read-only / Telemetry patterns
const TIER_1_COMMANDS = new Set([
    'ls', 'dir', 'cat', 'head', 'tail', 'more', 'less', 'grep', 'egrep', 'fgrep',
    'awk', 'sed -n', 'cut', 'sort', 'uniq', 'wc', 'diff', 'cmp',
    'find', 'locate', 'which', 'whereis', 'type', 'file',
    'whoami', 'id', 'uname', 'hostname', 'uptime', 'date', 'env', 'printenv',
    'df', 'du', 'free', 'vmstat', 'iostat', 'top', 'htop', 'ps', 'pgrep', 'pstree',
    'ss', 'netstat', 'lsof', 'ip', 'ifconfig', 'route', 'ping', 'traceroute', 'dig', 'nslookup', 'host',
    'curl', 'wget', 'git status', 'git log', 'git diff', 'git branch', 'git show',
    'docker ps', 'docker logs', 'docker inspect', 'docker stats', 'docker version',
    'systemctl status', 'systemctl is-active', 'systemctl is-enabled',
    'journalctl', 'dmesg', 'last', 'w', 'who'
]);
export class MatlockGuardrails {
    /**
     * Classify command into Tier 1 (Safe), Tier 2 (Mutating), or Tier 3 (Destructive)
     */
    static evaluate(command, confirmDangerToken) {
        const trimmed = command.trim();
        // Check for Tier 3 Destructive patterns first
        for (const pattern of TIER_3_PATTERNS) {
            if (pattern.regex.test(trimmed)) {
                if (!confirmDangerToken) {
                    return {
                        tier: 'TIER_3_DESTRUCTIVE',
                        reason: `BLOCKED by Matlock Guardrails: ${pattern.reason}. If this destructive action is intentional, you must explicitly set 'confirm_danger_token: true'.`,
                        blocked: true,
                    };
                }
                return {
                    tier: 'TIER_3_DESTRUCTIVE',
                    reason: `ALLOWED with explicit confirmation token: ${pattern.reason}.`,
                    blocked: false,
                };
            }
        }
        // Check if it's Tier 1 Read-only
        const firstWord = trimmed.split(/[\s|&;]+/)[0].toLowerCase();
        const firstTwoWords = trimmed.split(/[\s|&;]+/).slice(0, 2).join(' ').toLowerCase();
        if (TIER_1_COMMANDS.has(firstTwoWords) || TIER_1_COMMANDS.has(firstWord)) {
            // Ensure there are no write redirections like > or >> or pipe into sh
            if (!/>>|>|\bsh\b|\bbash\b/.test(trimmed)) {
                return {
                    tier: 'TIER_1_SAFE',
                    reason: 'Read-only telemetry or inspection command.',
                    blocked: false,
                };
            }
        }
        // Default to Tier 2 Mutating (safe to execute, but tracked and state-monitored)
        return {
            tier: 'TIER_2_MUTATING',
            reason: 'State mutation command (creates/modifies processes, files, or packages). Monitored with pre/post flight assertions.',
            blocked: false,
        };
    }
    /**
     * Generates safe dry-run recommendation if a command looks ambiguous
     */
    static sanitizeEnvironment() {
        return {
            DEBIAN_FRONTEND: 'noninteractive',
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
            TERM: 'xterm-256color',
        };
    }
}
//# sourceMappingURL=guardrails.js.map
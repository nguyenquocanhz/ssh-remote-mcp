import { McpAutoInstaller } from './auto-installer.js';

export function runInstallerCli(args: string[]): void {
  const isHelp = args.includes('--help') || args.includes('-h');
  const isList = args.includes('list') || args.includes('--list');
  const isNpx = args.includes('--npx');
  const isAll = args.includes('--all');
  const isDryRun = args.includes('--dry-run');

  console.log('\n======================================================');
  console.log('   🛡️  SSH-REMOTE-MCP UNIVERSAL AGENT IDE INSTALLER   ');
  console.log('======================================================\n');

  if (isHelp) {
    console.log('Usage:');
    console.log('  ssh-remote-mcp install [options]\n');
    console.log('Options:');
    console.log('  --npx       Configure to run via npx github:nguyenquocanhz/ssh-remote-mcp (Default: local node path)');
    console.log('  --local     Configure to run via local node executable & dist/index.js');
    console.log('  --all       Force-configure all supported IDEs even if not previously initialized');
    console.log('  --dry-run   Preview configuration actions without writing to disk');
    console.log('  list        List all supported Agent IDEs and detection status on this machine');
    console.log('  -h, --help  Show this help screen\n');
    return;
  }

  if (isList) {
    console.log('Scanning system for Agent IDEs & MCP clients...\n');
    const scanned = McpAutoInstaller.scan();
    for (const ide of scanned) {
      const statusIcon = ide.exists ? '✅ DETECTED' : '⚪ NOT FOUND';
      console.log(`[${statusIcon}] ${ide.name.padEnd(28)} -> ${ide.path}`);
    }
    console.log('');
    return;
  }

  const mode = isNpx ? 'npx' : 'local';
  console.log(`Mode: [${mode.toUpperCase()}]`);
  console.log(`Force all IDEs: ${isAll ? 'YES' : 'NO (only detected)'}`);
  console.log(`Dry-run: ${isDryRun ? 'YES (No files modified)' : 'NO'}\n`);
  console.log('Installing ssh-remote-mcp into Agent IDEs...\n');

  const results = McpAutoInstaller.install({
    mode,
    forceAll: isAll,
    dryRun: isDryRun,
  });

  let installedCount = 0;
  for (const res of results) {
    let icon = '⚪';
    if (res.status === 'INSTALLED' || res.status === 'UPDATED') {
      icon = '🚀';
      installedCount++;
    } else if (res.status === 'ALREADY_CONFIGURED') {
      icon = '✅';
      installedCount++;
    } else if (res.status === 'FAILED') {
      icon = '❌';
    }

    console.log(`${icon} [${res.status}] ${res.ideName}`);
    console.log(`   Path: ${res.configPath}`);
    if (res.backupPath) {
      console.log(`   Backup: ${res.backupPath}`);
    }
    console.log(`   Detail: ${res.message}\n`);
  }

  console.log('------------------------------------------------------');
  if (installedCount > 0) {
    console.log(`✨ Success: ssh-remote-mcp is now configured in ${installedCount} Agent IDE(s)!`);
    console.log('👉 Please restart or reload your Agent IDE to activate the tools.');
  } else {
    console.log('ℹ️  No new IDE configurations were modified.');
  }
  console.log('======================================================\n');
}

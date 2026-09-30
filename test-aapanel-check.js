import { handleSshHostDiagnose } from './dist/tools/diagnose.js';
import { handleSshExec } from './dist/tools/exec.js';
import { MatlockSessionPool } from './dist/core/session-pool.js';

async function checkServer() {
  console.log('=== [BƯỚC 1: KHÁM NGHIỆM TỔNG QUAN HOMELAB] ===');
  const diag = await handleSshHostDiagnose({});
  console.log(`OS: ${diag.os}`);
  console.log(`RAM trống: ${diag.memoryMb.available} MB / ${diag.memoryMb.total} MB`);
  console.log(`Load Average: ${diag.loadAverage}`);
  console.log(`Số cổng đang lắng nghe: ${diag.listeningPorts.length}`);

  console.log('\n=== [BƯỚC 2: KIỂM TRA AAPANEL ĐÃ CÀI ĐẶT CHƯA] ===');
  const checkBt = await handleSshExec({
    command: 'if command -v bt >/dev/null 2>&1; then bt status; else echo "AAPANEL_NOT_FOUND"; fi',
    assertions: {
      assertProcessRunning: 'bt',
      assertPortListening: 8888,
    }
  });

  console.log('Kết quả kiểm tra:', checkBt.stdout);
  console.log('Phân loại lệnh:', checkBt.tier);
  console.log('Forensic Assertions:');
  for (const a of checkBt.assertions) {
    console.log(`  - [${a.passed ? 'PASSED' : 'FAILED'}] ${a.check}: ${a.detail}`);
  }

  console.log('\n=== [BƯỚC 3: KIỂM TRA XUNG ĐỘT CỔNG & DỊCH VỤ WEB] ===');
  const checkConflicts = await handleSshExec({
    command: 'ss -tulpn | grep -E ":(80|443|8888)\\b" || echo "PORTS_FREE"',
  });
  console.log('Trạng thái các cổng 80, 443, 8888:\n' + checkConflicts.stdout);

  console.log('\n=== [BƯỚC 4: KIỂM TRA WRENPANEL / CONTROL PANELS ĐANG CÓ] ===');
  const checkWren = await handleSshExec({
    command: 'ls -la /home/nqatech/wrenpanel 2>/dev/null || echo "WRENPANEL_DIR_NOT_FOUND"',
  });
  console.log('Nội dung thư mục wrenpanel:\n' + checkWren.stdout);

  MatlockSessionPool.closeAll();
  process.exit(0);
}

checkServer().catch(err => {
  console.error('Error:', err);
  MatlockSessionPool.closeAll();
  process.exit(1);
});

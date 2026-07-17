import { spawnSync } from 'node:child_process';

const APP_ID = 'com.haruka.catdiary';

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  if (options.selfCheck) {
    runSelfCheck();
    process.exit(0);
  }

  const result = runPreflight();
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`ANDROID_MAESTRO_PREFLIGHT_OK ${JSON.stringify(result)}`);
} catch (error) {
  console.error(
    `ANDROID_MAESTRO_PREFLIGHT_INVALID\n- ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function runPreflight() {
  const maestroVersion = commandOutput('maestro', ['--version'], {
    env: {
      ...process.env,
      MAESTRO_CLI_NO_ANALYTICS: '1',
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
    },
    label: '无法运行 Maestro CLI。请先安装并确认 maestro 在 PATH 中可用',
  });

  commandOutput('adb', ['version'], { label: '无法运行 adb。请先安装 Android platform-tools' });
  const devices = parseAdbDevices(commandOutput('adb', ['devices', '-l']));
  if (devices.length === 0) {
    throw new Error('未发现 Android 设备。请插线、解锁手机，并确认 USB 调试授权。');
  }
  if (devices.length > 1) {
    throw new Error(
      `发现 ${devices.length} 台 Android 设备。请只保留一台目标设备，避免 Maestro 跑错设备。`,
    );
  }

  const device = devices[0];
  if (device.state !== 'device') {
    throw new Error(`Android 设备未授权或不可用：${device.serial} ${device.state}`);
  }

  const packagePath = commandOutput('adb', ['-s', device.serial, 'shell', 'pm', 'path', APP_ID], {
    label: `未检测到 ${APP_ID}。请先安装 Android Development Build`,
  });
  if (!packagePath.includes(`package:`)) {
    throw new Error(`未检测到 ${APP_ID}。请先安装 Android Development Build。`);
  }

  const windowPolicy = commandOutput('adb', [
    '-s',
    device.serial,
    'shell',
    'dumpsys',
    'window',
    'policy',
  ]);
  const lockState = parseKeyguardState(windowPolicy);
  if (lockState.showing || lockState.inputRestricted) {
    throw new Error(
      `Android 真机仍在锁屏或输入受限状态。请手动解锁并保持屏幕亮起后再运行 Maestro。${JSON.stringify(
        lockState,
      )}`,
    );
  }

  return {
    device: {
      serial: redactSerial(device.serial),
      model: device.model,
      product: device.product,
    },
    appId: APP_ID,
    appInstalled: true,
    keyguard: lockState,
    maestroVersion: lastMeaningfulLine(maestroVersion),
  };
}

function parseAdbDevices(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial, state, ...attributes] = line.split(/\s+/);
      return {
        serial,
        state,
        model: attributeValue(attributes, 'model'),
        product: attributeValue(attributes, 'product'),
      };
    })
    .filter((device) => device.serial && device.state);
}

function attributeValue(attributes, name) {
  const prefix = `${name}:`;
  return attributes.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? undefined;
}

function parseKeyguardState(output) {
  return {
    showing: booleanField(output, 'showing'),
    inputRestricted: booleanField(output, 'inputRestricted'),
    secure: booleanField(output, 'secure'),
    trusted: booleanField(output, 'mTrusted'),
    screenOn: /screenState=SCREEN_STATE_ON/.test(output),
    interactive: /interactiveState=INTERACTIVE_STATE_AWAKE/.test(output),
  };
}

function booleanField(source, name) {
  const match = source.match(new RegExp(`(?:^|\\s)${escapeRegExp(name)}=(true|false)`));
  return match ? match[1] === 'true' : false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commandOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(options.label ?? `${command} ${args.join(' ')} 执行失败：${result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`.trim();
}

function redactSerial(serial) {
  const normalized = String(serial ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return normalized ? `redacted-last4-${normalized.slice(-4)}` : 'redacted';
}

function lastMeaningfulLine(output) {
  return (
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith('╭') && !line.startsWith('│') && !line.startsWith('╰'),
      )
      .at(-1) ?? output.trim()
  );
}

function runSelfCheck() {
  const devices = parseAdbDevices(
    [
      'List of devices attached',
      '476640dd               device usb:0-1 product:PKG110 model:PKG110 device:OP5D2BL1 transport_id:1',
    ].join('\n'),
  );
  const locked = parseKeyguardState(`
    KeyguardServiceDelegate
      showing=true
      inputRestricted=true
      secure=true
      screenState=SCREEN_STATE_ON
      interactiveState=INTERACTIVE_STATE_AWAKE
      KeyguardStateMonitor
        mTrusted=false
  `);
  const unlocked = parseKeyguardState(`
    KeyguardServiceDelegate
      showing=false
      inputRestricted=false
      secure=true
      screenState=SCREEN_STATE_ON
      interactiveState=INTERACTIVE_STATE_AWAKE
      KeyguardStateMonitor
        mTrusted=true
  `);

  const checks = {
    parsesDevice: devices.length === 1 && devices[0].serial === '476640dd',
    parsesModel: devices[0]?.model === 'PKG110',
    redactsSerial: redactSerial(devices[0]?.serial) === 'redacted-last4-40dd',
    detectsLocked:
      locked.showing === true && locked.inputRestricted === true && locked.screenOn === true,
    detectsUnlocked: unlocked.showing === false && unlocked.inputRestricted === false,
    filtersVersionBanner: lastMeaningfulLine('notice\n2.6.1') === '2.6.1',
    acceptsPnpmArgumentSeparator: parseArgs(['--', '--json']).json === true,
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`ANDROID_MAESTRO_PREFLIGHT_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`ANDROID_MAESTRO_PREFLIGHT_SELF_CHECK_OK ${JSON.stringify(checks)}`);
}

function parseArgs(argv) {
  const parsed = { help: false, selfCheck: false, json: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--self-check') parsed.selfCheck = true;
    else if (arg === '--json') parsed.json = true;
    else throw new Error(`未知参数：${arg}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Android Maestro 真机前置检查

Usage:
  pnpm e2e:maestro:preflight
  pnpm e2e:maestro:preflight -- --json

检查内容：
  - Maestro CLI 可运行
  - adb 可运行且只连接一台 Android 设备
  - com.haruka.catdiary Development Build 已安装
  - 设备没有停在锁屏或输入受限状态

说明：
  该命令不会修改手机状态。若失败，请按错误提示处理后再运行 Maestro 流程。
`);
}

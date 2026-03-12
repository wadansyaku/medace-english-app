const normalizePlatformVersion = (value) => value.replace(/-/g, '.');

const compareVersionsDescending = (left, right) => {
  const leftParts = normalizePlatformVersion(left).split('.').map((part) => Number(part) || 0);
  const rightParts = normalizePlatformVersion(right).split('.').map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return 0;
};

const parseRuntimeVersion = (runtimeName) => {
  const match = runtimeName.match(/iOS[- ]([0-9-]+)/);
  return match ? normalizePlatformVersion(match[1]) : '';
};

export const createDoctorTools = ({
  runCommand,
  tryRunCommand,
  runJsonCommand,
  requestedDeviceName,
  requestedPlatformVersion,
  requestedUdid,
  installDriver,
}) => {
  const readAvailableDevices = async () => {
    const payload = await runJsonCommand('xcrun', ['simctl', 'list', '--json', 'devices', 'available']);
    const devices = [];

    Object.entries(payload.devices || {}).forEach(([runtimeName, entries]) => {
      const platformVersion = parseRuntimeVersion(runtimeName);
      for (const entry of entries || []) {
        if (entry.isAvailable === false) continue;
        if (!entry.name.startsWith('iPhone')) continue;
        devices.push({
          runtimeName,
          platformVersion,
          name: entry.name,
          udid: entry.udid,
          state: entry.state,
        });
      }
    });

    return devices;
  };

  const selectSimulator = (devices) => {
    if (devices.length === 0) {
      throw new Error('利用可能な iPhone Simulator が見つかりません。');
    }

    if (requestedUdid) {
      const matched = devices.find((device) => device.udid === requestedUdid);
      if (!matched) {
        throw new Error(`指定した UDID の Simulator が見つかりません: ${requestedUdid}`);
      }
      return matched;
    }

    const preferredNames = [
      requestedDeviceName,
      'iPhone 15 Pro',
      'iPhone 16 Pro',
      'iPhone 17 Pro',
      'iPhone 16',
      'iPhone 15',
      'iPhone SE (3rd generation)',
    ].filter(Boolean);
    const exactPlatformVersion = requestedPlatformVersion || '';

    const sorted = [...devices].sort((left, right) => {
      if (left.state === 'Booted' && right.state !== 'Booted') return -1;
      if (right.state === 'Booted' && left.state !== 'Booted') return 1;

      const leftNameRank = preferredNames.findIndex((name) => name === left.name);
      const rightNameRank = preferredNames.findIndex((name) => name === right.name);
      if (leftNameRank !== rightNameRank) {
        return (leftNameRank === -1 ? Number.MAX_SAFE_INTEGER : leftNameRank)
          - (rightNameRank === -1 ? Number.MAX_SAFE_INTEGER : rightNameRank);
      }

      if (exactPlatformVersion) {
        const leftExact = left.platformVersion === exactPlatformVersion;
        const rightExact = right.platformVersion === exactPlatformVersion;
        if (leftExact !== rightExact) return leftExact ? -1 : 1;
      }

      const versionDiff = compareVersionsDescending(left.platformVersion || '0', right.platformVersion || '0');
      if (versionDiff !== 0) return versionDiff;
      return left.name.localeCompare(right.name);
    });

    return sorted[0];
  };

  const inspectXcode = async () => {
    const result = await tryRunCommand('xcodebuild', ['-version']);
    if (!result.ok) {
      return {
        ok: false,
        summary: 'missing',
        error: result.stderr,
      };
    }

    return {
      ok: true,
      summary: result.stdout.trim().replace(/\s+/g, ' | '),
    };
  };

  const inspectAppium = async () => {
    const versionResult = await tryRunCommand('npx', ['--yes', 'appium', '--version']);
    if (!versionResult.ok) {
      return {
        ok: false,
        version: 'unavailable',
        driverInstalled: false,
        error: versionResult.stderr,
      };
    }

    const driverResult = await tryRunCommand('npx', ['--yes', 'appium', 'driver', 'list', '--installed']);
    const driverInventory = `${driverResult.stdout}\n${driverResult.stderr}`;

    return {
      ok: true,
      version: versionResult.stdout.trim() || 'unknown',
      driverInstalled: driverResult.ok && driverInventory.includes('xcuitest'),
      driverInventory,
    };
  };

  const collectDoctorInfo = async () => {
    const [xcode, devices, appium] = await Promise.all([
      inspectXcode(),
      readAvailableDevices(),
      inspectAppium(),
    ]);

    const selectedDevice = selectSimulator(devices);
    const issues = [];

    if (!xcode.ok) {
      issues.push('Xcode command line tools are unavailable.');
    }
    if (!appium.ok) {
      issues.push('Appium is unavailable via `npx --yes appium`.');
    } else if (!appium.driverInstalled) {
      issues.push('Appium XCUITest driver is not installed.');
    }

    return {
      xcode,
      appium,
      devices,
      selectedDevice,
      issues,
    };
  };

  const printDoctorSummary = (info) => {
    console.log('iOS simulator smoke doctor');
    console.log(`- Xcode: ${info.xcode.summary}`);
    console.log(
      `- Selected simulator: ${info.selectedDevice.name} (${info.selectedDevice.platformVersion || 'unknown'}) ` +
      `[${info.selectedDevice.udid}] state=${info.selectedDevice.state}`,
    );
    console.log(`- Available iPhone simulators: ${info.devices.length}`);
    console.log(`- Appium: ${info.appium.version}`);
    console.log(`- XCUITest driver: ${info.appium.driverInstalled ? 'installed' : 'missing'}`);

    if (info.issues.length === 0) {
      console.log('Doctor passed.');
      return;
    }

    console.log('Doctor found blocking issues:');
    info.issues.forEach((issue) => console.log(`  - ${issue}`));
    console.log('Next steps:');
    console.log('  - Install Appium driver: npx --yes appium driver install xcuitest');
    console.log('  - Re-run doctor: npm run test:ios-simulator:doctor');
  };

  const ensureXcuitestDriver = async () => {
    const { stdout, stderr } = await runCommand('npx', ['--yes', 'appium', 'driver', 'list', '--installed']);
    const inventory = `${stdout}\n${stderr}`;
    if (inventory.includes('xcuitest')) return;

    if (!installDriver) {
      throw new Error('Appium XCUITest driver is missing. Re-run with `--install-driver` or run `npm run test:ios-simulator:doctor`.');
    }

    console.log('Installing Appium XCUITest driver...');
    await runCommand('npx', ['--yes', 'appium', 'driver', 'install', 'xcuitest'], { printOutput: true });
  };

  return {
    readAvailableDevices,
    inspectXcode,
    inspectAppium,
    collectDoctorInfo,
    printDoctorSummary,
    ensureXcuitestDriver,
  };
};

export default createDoctorTools;

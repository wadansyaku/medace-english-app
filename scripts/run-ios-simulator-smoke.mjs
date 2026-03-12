import { mkdir } from 'node:fs/promises';

import { createSmokeConfig } from './ios-simulator-smoke/config.mjs';
import { createProcessManager, sleep } from './ios-simulator-smoke/processes.mjs';
import { createDoctorTools } from './ios-simulator-smoke/doctor.mjs';
import { createWebDriverClient } from './ios-simulator-smoke/webdriver.mjs';
import { createScenarioRunner } from './ios-simulator-smoke/scenario.mjs';

const config = createSmokeConfig();
const processManager = createProcessManager(config.cwd);
const doctorTools = createDoctorTools({
  runCommand: processManager.runCommand,
  tryRunCommand: processManager.tryRunCommand,
  runJsonCommand: processManager.runJsonCommand,
  requestedDeviceName: config.requestedDeviceName,
  requestedPlatformVersion: config.requestedPlatformVersion,
  requestedUdid: config.requestedUdid,
  installDriver: config.installDriver,
});

const main = async () => {
  await mkdir(config.outputDir, { recursive: true });

  const doctorInfo = await doctorTools.collectDoctorInfo();
  doctorTools.printDoctorSummary(doctorInfo);

  if (config.doctorMode) {
    if (doctorInfo.issues.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (doctorInfo.issues.some((issue) => issue !== 'Appium XCUITest driver is not installed.')) {
    throw new Error('iOS simulator smoke prerequisites are not satisfied. Run `npm run test:ios-simulator:doctor` first.');
  }

  if (!config.skipBuild) {
    console.log('Building app...');
    await processManager.runCommand('npm', ['run', 'build'], { printOutput: true });
  }

  await doctorTools.ensureXcuitestDriver();

  const selectedDevice = doctorInfo.selectedDevice;
  console.log(`Booting simulator ${selectedDevice.name} (${selectedDevice.platformVersion || 'unknown'})...`);
  await processManager.runCommand('xcrun', ['simctl', 'boot', selectedDevice.udid]).catch((error) => {
    if (!String(error).includes('Unable to boot device in current state: Booted')) {
      throw error;
    }
  });
  await processManager.runCommand('xcrun', ['simctl', 'bootstatus', selectedDevice.udid, '-b']);
  await processManager.runCommand('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', selectedDevice.udid]);

  const smokeServer = await processManager.startManagedProcess(
    'wrangler-pages-dev',
    'node',
    ['scripts/start-smoke-server.mjs', '--port', String(config.smokePort)],
    new RegExp(`Ready on http://127\\.0\\.0\\.1:${config.smokePort}`),
  );
  const appiumServer = await processManager.startManagedProcess(
    'appium',
    'npx',
    ['--yes', 'appium', '--port', String(config.appiumPort), '--log-no-colors'],
    /Appium REST http interface listener started on/,
  );

  const webdriverClient = createWebDriverClient({
    appiumBaseUrl: config.appiumBaseUrl,
    appUrl: config.appUrl,
    sleep,
  });
  const scenarioRunner = createScenarioRunner({
    appUrl: config.appUrl,
    screenshotPath: config.screenshotPath,
    writingFeedbackScreenshotPath: config.writingFeedbackScreenshotPath,
    runCommand: processManager.runCommand,
    sleep,
    webdriverClient,
  });

  let sessionId = null;

  try {
    const session = await webdriverClient.webdriver('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          platformName: 'iOS',
          browserName: 'Safari',
          'appium:automationName': 'XCUITest',
          'appium:deviceName': selectedDevice.name,
          'appium:platformVersion': selectedDevice.platformVersion,
          'appium:udid': selectedDevice.udid,
          'appium:newCommandTimeout': 240,
          'appium:connectHardwareKeyboard': false,
          'appium:autoWebview': true,
          'appium:safariInitialUrl': config.appUrl,
        },
        firstMatch: [{}],
      },
    });
    sessionId = session.sessionId;
    console.log(`Created Appium Safari session: ${sessionId}`);
    await webdriverClient.webdriver('POST', `/session/${sessionId}/timeouts`, {
      script: 30000,
      pageLoad: 300000,
      implicit: 0,
    });

    await scenarioRunner.runFlow(sessionId);
    console.log('iOS simulator smoke completed successfully.');
    console.log(`Smoke server logs captured: ${smokeServer.getLogs().split('\n').length} lines`);
    console.log(`Appium logs captured: ${appiumServer.getLogs().split('\n').length} lines`);
  } finally {
    if (sessionId) {
      await webdriverClient.webdriver('DELETE', `/session/${sessionId}`).catch(() => {});
    }
    await processManager.cleanup();
  }
};

main().catch(async (error) => {
  console.error(error);
  await processManager.cleanup();
  process.exit(1);
});

import path from 'node:path';

const readArg = (args, name, fallback) => {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const hasFlag = (args, name) => args.includes(`--${name}`);

export const createSmokeConfig = ({
  cwd = process.cwd(),
  argv = process.argv.slice(2),
} = {}) => {
  const smokePort = Number(readArg(argv, 'port', '41731'));
  const appiumPort = Number(readArg(argv, 'appium-port', '4725'));

  return {
    cwd,
    args: argv,
    smokePort,
    appiumPort,
    requestedDeviceName: readArg(argv, 'device-name', ''),
    requestedPlatformVersion: readArg(argv, 'platform-version', ''),
    requestedUdid: readArg(argv, 'udid', ''),
    skipBuild: hasFlag(argv, 'skip-build'),
    doctorMode: hasFlag(argv, 'doctor'),
    installDriver: hasFlag(argv, 'install-driver'),
    appUrl: `http://127.0.0.1:${smokePort}/`,
    appiumBaseUrl: `http://127.0.0.1:${appiumPort}`,
    outputDir: path.join(cwd, 'output', 'simulator'),
    screenshotPath: path.join(cwd, 'output', 'simulator', 'ios-appium-study-flip.png'),
    writingFeedbackScreenshotPath: path.join(cwd, 'output', 'simulator', 'ios-appium-writing-feedback.png'),
  };
};

export default createSmokeConfig;

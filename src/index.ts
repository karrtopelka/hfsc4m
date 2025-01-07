import fetch from 'node-fetch';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import figlet from 'figlet';
import fsSync from 'fs';
import boxen from 'boxen';

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nGracefully shutting down...'));
  console.log(chalk.blue('Please wait for current request to complete...'));
  process.exit(0);
});

// Add this function to create ASCII art
const displayTitle = () => {
  console.log(
    chalk.magenta(
      figlet.textSync('HYPURR SCAM', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
      }),
    ),
  );
  console.log(chalk.magenta('made with 💜 by karrtopelka'));
  console.log(); // Add empty line after signature
};

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('data', {
    alias: 'd',
    type: 'string',
    description: 'Base64 encoded data to send in the request',
    demandOption: true,
    coerce: (arg: string) => {
      if (!arg || arg.trim() === '') {
        throw new Error('Data argument cannot be empty');
      }
      return arg;
    },
  })
  .option('no-stop', {
    alias: 'n',
    type: 'boolean',
    description: 'Continue running even after finding "Bought"',
    default: false,
  })
  .option('max-attempts', {
    alias: 'm',
    type: 'number',
    description: 'Maximum number of attempts',
    default: 10000,
  })
  .option('delay', {
    alias: 'l',
    type: 'number',
    description: 'Base delay between requests in seconds (will vary ±20%)',
    default: 0.6,
  })
  .option('stop-on-decode-error', {
    alias: 's',
    type: 'boolean',
    description: 'Stop if response cannot be decoded',
    default: false,
  })
  .option('release-time', {
    alias: 'r',
    type: 'string',
    description:
      'Token release time (format: "1/7/2025, 3:29:58 PM"). If not provided, starts immediately',
    demandOption: false,
    coerce: (arg: string) => {
      if (!arg) return null;
      const date = new Date(arg);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid release time format. Use: "1/7/2025, 3:29:58 PM"');
      }
      return date;
    },
  })
  .option('start-before', {
    alias: 'b',
    type: 'number',
    description: 'Start buying X seconds before freeze time ends',
    default: 5,
  })
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to config file',
    coerce: (arg: string) => {
      try {
        return JSON.parse(fsSync.readFileSync(arg, 'utf8'));
      } catch (error) {
        throw new Error(`Failed to read config file: ${error}`);
      }
    },
  })
  .help()
  .alias('help', 'h')
  .parseSync();

// Update sleep function to add random jitter
const sleep = (seconds: number) => {
  // Add random variation between -20% to +20% of the base delay
  const jitter = seconds * (0.8 + Math.random() * 0.4);
  return new Promise((resolve) => setTimeout(resolve, jitter * 1000));
};

async function makeTradeRequest(data: string): Promise<string> {
  const url = 'https://telegram.hypurr.fun/hypurr.Telegram/HyperliquidLaunchTrade';

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/grpc-web-text',
      },
    });

    const responseText = await response.text();
    console.log(chalk.dim('Response:'));
    console.log(chalk.gray(responseText));

    try {
      const decodedResponse = Buffer.from(responseText, 'base64').toString();
      return decodedResponse;
    } catch (decodeError) {
      console.log(chalk.yellow('Failed to decode response'));
      if (argv['stop-on-decode-error']) {
        console.log(chalk.red.bold('Stopping due to decode error'));
        process.exit(1);
      }
      return responseText;
    }
  } catch (error) {
    console.error(chalk.red('Request failed:'), error);
    throw error;
  }
}

interface Stats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  startTime: number;
  decodeErrors: number;
  requestsPerSecond: number[];
}

const getMemoryUsage = () => {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
  };
};

type ChalkColor = 'blue' | 'green' | 'red' | 'yellow' | 'magenta' | 'gray' | 'cyan' | 'white';
type StatItem = [string, string | number, ChalkColor];

const renderStats = (stats: Stats) => {
  const endTime = Date.now();
  const runtime = ((endTime - stats.startTime) / 1000).toFixed(2);
  const avgRequestRate = stats.totalRequests / parseFloat(runtime);
  const memory = getMemoryUsage();

  const statItems: StatItem[] = [
    ['Total Requests', stats.totalRequests, 'blue'],
    ['Successful Requests', stats.successfulRequests, 'green'],
    ['Failed Requests', stats.failedRequests, 'red'],
    ['Decode Errors', stats.decodeErrors, 'yellow'],
    ['Total Runtime', `${runtime}s`, 'magenta'],
    ['Avg Requests/Second', avgRequestRate.toFixed(2), 'blue'],
    ['Memory Usage', `${memory.heapUsed}MB / ${memory.heapTotal}MB`, 'gray'],
  ];

  console.log(
    boxen(
      chalk.cyan.bold('Final Statistics\n\n') +
        statItems
          .map(
            ([label, value, color]) =>
              `${chalk.white(String(label).padEnd(20))}${chalk[color](value)}`,
          )
          .join('\n'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      },
    ),
  );
};

async function main() {
  // Clear console
  console.clear();

  displayTitle();
  const stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    startTime: Date.now(),
    decodeErrors: 0,
    requestsPerSecond: [],
  };

  const releaseTime = argv['release-time'] as Date | null;

  if (releaseTime) {
    const startBefore = argv['start-before'];
    const freezeEndTime = new Date(releaseTime.getTime() + 60000);
    const startTime = new Date(freezeEndTime.getTime() - startBefore * 1000);

    console.log(chalk.cyan('Starting trade bot...\n'));
    console.log(chalk.blue(`Release time: ${releaseTime.toLocaleString()}`));
    console.log(chalk.blue(`Freeze ends: ${freezeEndTime.toLocaleString()}`));
    console.log(chalk.blue(`Will start buying: ${startTime.toLocaleString()}\n`));

    const now = new Date();
    if (now < startTime) {
      const waitMs = startTime.getTime() - now.getTime();

      console.log(
        chalk.yellow(`Waiting ${(waitMs / 1000).toFixed(1)} seconds until start time...`),
      );

      await sleep(waitMs / 1000);
    }
  } else {
    console.log(chalk.cyan('Starting trade bot immediately...\n'));
  }

  let attempt = 1;
  let success = false;
  const data = argv.data;
  const noStop = argv['no-stop'];
  const maxAttempts = argv['max-attempts'];
  const delay = argv['delay'];

  while (attempt <= maxAttempts && (!success || noStop)) {
    console.log(chalk.blue(`Request #${attempt}...`));

    try {
      const decodedResponse = await makeTradeRequest(data);
      console.log(chalk.dim('Decoded response:'));
      console.log(chalk.gray(decodedResponse));
      console.log();

      if (decodedResponse.includes('Bought')) {
        stats.successfulRequests++;
        success = true;
        console.log(chalk.green.bold('Success! Found "Bought" in response.'));
        if (!noStop) {
          renderStats(stats);
          process.exit(0);
        }
      } else {
        stats.failedRequests++;
        console.log(chalk.yellow('No "Bought" found, trying again...'));
        console.log();
      }

      attempt++;
      stats.totalRequests++;
      if (attempt <= maxAttempts) {
        await sleep(delay);
      }
    } catch (error) {
      stats.decodeErrors++;
      console.log(chalk.red('Request failed, trying again...'));
      attempt++;
      if (attempt <= maxAttempts) {
        await sleep(delay);
      }
    }
  }

  if (!success) {
    console.log(chalk.red.bold(`Maximum attempts (${maxAttempts}) reached without success`));
    renderStats(stats);
    process.exit(1);
  } else {
    console.log(chalk.green.bold(`Maximum attempts (${maxAttempts}) reached`));
    renderStats(stats);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(chalk.red.bold('Fatal error:'), error);
  process.exit(1);
});

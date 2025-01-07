import fetch from 'node-fetch';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import figlet from 'figlet';

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

async function main() {
  displayTitle();
  let attempt = 1;
  let success = false;
  const data = argv.data;
  const noStop = argv['no-stop'];
  const maxAttempts = argv['max-attempts'];
  const delay = argv['delay'];

  console.log(chalk.cyan('Starting trade bot...\n'));

  while (attempt <= maxAttempts && (!success || noStop)) {
    console.log(chalk.blue(`Request #${attempt}...`));

    try {
      const decodedResponse = await makeTradeRequest(data);
      console.log(chalk.dim('Decoded response:'));
      console.log(chalk.gray(decodedResponse));
      console.log();

      if (decodedResponse.includes('Bought')) {
        success = true;
        console.log(chalk.green.bold('Success! Found "Bought" in response.'));
        if (!noStop) {
          process.exit(0);
        }
      } else {
        console.log(chalk.yellow('No "Bought" found, trying again...'));
        console.log();
      }
      attempt++;
      if (attempt <= maxAttempts) {
        await sleep(delay);
      }
    } catch (error) {
      console.log(chalk.red('Request failed, trying again...'));
      attempt++;
      if (attempt <= maxAttempts) {
        await sleep(delay);
      }
    }
  }

  if (!success) {
    console.log(chalk.red.bold(`Maximum attempts (${maxAttempts}) reached without success`));
    process.exit(1);
  } else {
    console.log(chalk.green.bold(`Maximum attempts (${maxAttempts}) reached`));
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(chalk.red.bold('Fatal error:'), error);
  process.exit(1);
});

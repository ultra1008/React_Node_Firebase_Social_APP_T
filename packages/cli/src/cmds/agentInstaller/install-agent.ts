import { promises as fs } from 'fs';
import Yargs from 'yargs';
import { resolve } from 'path';
import { ValidationError, AbortError, InstallError } from '../errors';
import { verbose } from '../../utils';
import AgentInstallerProcedure from './agentInstallerProcedure';
import chalk from 'chalk';
import UI from '../userInteraction';
import Telemetry from '../../telemetry';
import AgentInstaller from './agentInstaller';
import { ProcessLog } from './commandRunner';
import MavenInstaller from './mavenInstaller';
import GradleInstaller from './gradleInstaller';
import { PipInstaller, PoetryInstaller } from './pythonAgentInstaller';
import { BundleInstaller } from './rubyAgentInstaller';

interface InstallCommandOptions {
  verbose?: any;
  projectType?: string;
  directory: string;
}

type AgentInstallerConstructor = new (...args: any[]) => AgentInstaller;
const INSTALLERS: readonly AgentInstallerConstructor[] = [
  BundleInstaller,
  MavenInstaller,
  GradleInstaller,
  PipInstaller,
  PoetryInstaller,
];

export default {
  command: 'install [directory]',
  aliases: ['i', 'install-agent'],
  describe: 'Install and configure an AppMap language agent',
  builder(args: Yargs.Argv) {
    // FIXME: This method takes advantage of the fact that each implementation returns a static string
    // as the installer name. In the future, this may not be the case. After all, `name` is a non-static
    // getter.
    const installerNames = INSTALLERS.map((installer) =>
      chalk.blue(installer.prototype.name)
    ).join(', ');

    args.option('project-type', {
      describe: [
        'Specifies the installation target. This may be a language or project framework. Case-insensitive.',
        `Supported project types: ${installerNames}`,
      ].join('\n'),
      type: 'string',
      default: undefined,
      alias: 'p',
    });
    args.positional('directory', {
      describe: 'directory in which to install',
      default: '.',
    });
    return args.strict();
  },

  async handler(args: InstallCommandOptions) {
    const { projectType, directory, verbose: isVerbose } = args;
    const startTime = Date.now();
    const endTime = () => (Date.now() - startTime) / 1000;
    let installer: AgentInstaller | undefined;
    const installers = INSTALLERS.map(
      (constructor) => new constructor(directory)
    );

    verbose(isVerbose);

    try {
      const installProcedure = new AgentInstallerProcedure(
        installers,
        directory
      );
      installer = await installProcedure.run(projectType);

      Telemetry.sendEvent({
        name: 'install-agent:success',
        properties: {
          installer: installer.name,
          path: resolve(directory),
        },
        metrics: {
          duration: endTime(),
        },
      });
    } catch (e) {
      let installersAvailable: string | undefined;
      let err = e;

      if (e instanceof InstallError) {
        err = e.error;
        installer = e.installer;
      }

      try {
        // Map installers to their available status, e.g.,
        // { maven: true, gradle: false, pip: false }
        const installerStatuses = await Promise.all(
          installers.map(async (installer) => [
            installer.name,
            await installer.available(),
          ])
        );

        // Join the available installers into a string
        installersAvailable = installerStatuses
          .filter(([_, available]) => available)
          .map(([name]) => name)
          .join(', ');
      } catch (e) {
        if (e instanceof Error) {
          installersAvailable = e.stack;
        } else {
          installersAvailable = String(e);
        }
      }

      if (err instanceof AbortError) {
        await Telemetry.sendEvent({
          name: 'install-agent:abort',
          properties: {
            installer: installer?.name,
            installers_available: installersAvailable,
            reason: err.message,
            path: resolve(directory),
          },
          metrics: {
            duration: endTime(),
          },
        });

        Yargs.exit(2, err);
      }

      let exception: string | undefined;
      if (err instanceof Error) {
        exception = err.stack;
      } else {
        exception = String(err);
      }

      let directoryContents: string | undefined;
      try {
        directoryContents = (await fs.readdir(directory)).join('\n');
      } catch (e) {
        if (e instanceof Error) {
          directoryContents = e.stack;
        } else {
          directoryContents = String(e);
        }
      }

      await Telemetry.sendEvent({
        name: 'install-agent:failure',
        properties: {
          installer: installer?.name,
          installers_available: installersAvailable,
          exception_type: (err as any)?.constructor?.name,
          log: ProcessLog.buffer,
          exception,
          directory: directoryContents,
          path: resolve(directory),
        },
        metrics: {
          duration: endTime(),
        },
      });

      if (err instanceof ValidationError) {
        console.warn(err.message);
        return Yargs.exit(1, err);
      }

      if (verbose()) {
        UI.error(err);
      } else {
        UI.error(
          `An error occurred. Try re-running the command with the ${chalk.red(
            'verbose'
          )} flag (${chalk.red('-v')}).`
        );
      }

      Yargs.exit(3, err as Error);
    }
  },
};
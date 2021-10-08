import Yargs from 'yargs';
import { promises as fs } from 'fs';
import {
  AbortError,
  ChildProcessError,
  InvalidPathError,
  ValidationError,
} from '../errors';
import { prefixLines, verbose } from '../../utils';
import AgentInstallerProcedure from './agentInstallerProcedure';
import chalk from 'chalk';
import UI from '../userInteraction';
import Telemetry from '../../telemetry';
import { INSTALLERS } from './installers';
import { getDirectoryProperty } from './telemetryUtil';
import { getProjects, ProjectConfiguration } from './projectConfiguration';
import AgentInstaller from './agentInstaller';
import { ProcessLog } from './commandRunner';

interface InstallCommandOptions {
  verbose?: any;
  projectType?: string;
  directory: string;
}

class InstallerError {
  readonly error: Error;
  readonly log: string;

  constructor(
    error: unknown,
    readonly duration: number,
    readonly project?: ProjectConfiguration
  ) {
    this.error = error instanceof Error ? error : new Error(String(error));
    this.log = ProcessLog.consumeBuffer();
  }

  get message(): string {
    if (
      this.error instanceof ValidationError ||
      this.error instanceof ChildProcessError
    ) {
      return this.error.message;
    } else if (this.error instanceof Error) {
      return this.error.stack || String(this.error);
    }

    return String(this.error);
  }

  async handle(): Promise<void> {
    UI.error();

    const installersAvailable = this.project?.availableInstallers
      .map((i) => i.name)
      .join(', ');

    if (this.error instanceof AbortError) {
      await Telemetry.sendEvent({
        name: 'install-agent:abort',
        properties: {
          installer: this.project?.selectedInstaller?.name,
          installers_available: installersAvailable,
          reason: this.error.message,
          path: this.project?.path,
        },
        metrics: {
          duration: this.duration,
        },
      });

      UI.error(`${chalk.yellow('!')} Installation has been aborted.`);
    } else if (this.error instanceof InvalidPathError) {
      Telemetry.sendEvent({
        name: 'install-agent:soft_failure',
        properties: {
          error: this.error.message,
          directory: this.project?.path
            ? await getDirectoryProperty(this.project.path)
            : undefined,
        },
      });

      UI.error(`${chalk.red('!')} ${this.error.message}`);
    } else {
      let exception: string | undefined;
      if (this.error instanceof Error) {
        exception = this.error.stack;
      } else {
        exception = String(this.error);
      }

      let directoryContents: string | undefined;
      if (this.project?.path) {
        try {
          directoryContents = (await fs.readdir(this.project.path)).join('\n');
        } catch (e) {
          if (e instanceof Error) {
            directoryContents = e.stack;
          } else {
            directoryContents = String(e);
          }
        }
      }

      await Telemetry.sendEvent({
        name: 'install-agent:failure',
        properties: {
          installer: this.project?.selectedInstaller?.name,
          installers_available: installersAvailable,
          exception_type: (this.error as any)?.constructor?.name,
          log: this.log,
          exception,
          directory: directoryContents,
          path: this.project?.path,
        },
        metrics: {
          duration: this.duration,
        },
      });
    }
  }
}

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

  async handler(args: InstallCommandOptions): Promise<void> {
    Telemetry.sendEvent({
      name: 'install-agent:start',
    });

    const { projectType, directory, verbose: isVerbose } = args;
    const errors: InstallerError[] = [];
    const installers = INSTALLERS.map(
      (constructor) => new constructor(directory)
    );

    verbose(isVerbose);

    try {
      const projects = await getProjects(
        installers,
        directory,
        true,
        projectType
      );

      for (let i = 0; i < projects.length; i++) {
        const startTime = Date.now();
        const endTime = () => (Date.now() - startTime) / 1000;
        const project = projects[i];
        const installProcedure = new AgentInstallerProcedure(
          project.selectedInstaller as AgentInstaller,
          project.path
        );

        console.log(
          `Installing AppMap agent for ${chalk.blue(project.name)}...`
        );

        try {
          await installProcedure.run();
        } catch (e) {
          let installerError = new InstallerError(e, endTime(), project);
          await installerError.handle();
          errors.push(installerError);
        }
      }

      if (errors.length) {
        const message =
          projects.length === 1
            ? 'Installation failed. View error details?'
            : `${errors.length} out of ${projects.length} installations failed. View error details?`;

        const { showError } = await UI.prompt(
          {
            name: 'showError',
            type: 'confirm',
            message,
            prefix: chalk.red('!'),
          },
          { supressSpinner: true }
        );

        if (showError) {
          errors.forEach((error) => {
            UI.error(
              projects.length > 1
                ? prefixLines(
                    error.message,
                    `[${chalk.red(error.project?.name)}] `
                  )
                : error.message
            );
          });
        }
      }
    } catch (err) {
      const installerError = new InstallerError(err, 0, undefined);
      await installerError.handle();

      errors.push(installerError);
    }

    if (errors.length) {
      Yargs.exit(1, new Error(errors.map((e) => e.message).join('\n')));
    }
  },
};

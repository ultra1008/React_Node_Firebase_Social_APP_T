import { promises as fsp } from 'fs';
import { join, sep } from 'path';
import moo from 'moo';
import chalk from 'chalk';
import CommandStruct from './commandStruct';
import AgentInstaller from './agentInstaller';
import { verbose, exists } from '../../utils';
import UI from '../userInteraction';
import { getColumn, getWhitespace, Whitespace } from './sourceUtil';
import { AbortError } from '../errors';
import JavaBuildToolInstaller from './javaBuildToolInstaller';
import { GradleParser, GradleParseResult } from './gradleParser';

export default class GradleInstaller
  extends JavaBuildToolInstaller
  implements AgentInstaller
{
  constructor(readonly path: string) {
    super(path);
  }

  get name(): string {
    return 'Gradle';
  }

  get buildFile(): string {
    return 'build.gradle';
  }

  get buildFilePath(): string {
    return join(this.path, this.buildFile);
  }

  async printJarPathCommand(): Promise<CommandStruct> {
    return new CommandStruct(
      await this.runCommand(),
      ['appmap-print-jar-path'],
      this.path
    );
  }

  async postInstallMessage(): Promise<string> {
    let gradleBin = 'gradle';
    if (await exists(join(this.path, 'gradlew'))) {
      gradleBin = `.${sep}gradlew`;
    }

    return [
      `Record your tests by running ${chalk.blue(`${gradleBin} appmap test`)}`,
      `By default, AppMap files will be output to ${chalk.blue(
        'build/appmap'
      )}`,
    ].join('\n');
  }

  async available(): Promise<boolean> {
    return await exists(this.buildFilePath);
  }

  async runCommand(): Promise<string> {
    const wrapperExists = await exists(join(this.path, 'gradlew'));

    if (wrapperExists) {
      return `.${sep}gradlew`;
    } else if (verbose()) {
      console.warn(
        `${chalk.yellow(
          'gradlew wrapper'
        )} not located, falling back to ${chalk.yellow('gradle')}`
      );
    }

    return 'gradle';
  }

  async verifyCommand(): Promise<CommandStruct> {
    return new CommandStruct(
      await this.runCommand(),
      [
        'dependencyInsight',
        '--dependency',
        'com.appland:appmap-agent',
        '--configuration',
        'appmapAgent',
        '--stacktrace',
      ],
      this.path
    );
  }

  /**
   * Add the com.appland.appmap plugin to build.gradle.
   *
   * Start by looking for an existing plugins block. If found, add our plugin to
   * it. If there's no plugins block, look for a buildscript block. If found,
   * insert a new plugins block after it. (Gradle requires that the plugins
   * block appear after the buildscript block, and before any other blocks.)
   *
   * If there's no plugins block, and no buildscript block, append a new plugins
   * block.
   *
   * @returns {string}
   */
  async insertPluginSpec(
    buildFileSource: string,
    parseResult: GradleParseResult,
    whitespace: Whitespace
  ): Promise<{ updatedSrc: string; offset: number }> {
    const pluginSpec = `id 'com.appland.appmap' version '1.1.0'`;

    const lines = parseResult.plugins
      ? buildFileSource
          .substring(parseResult.plugins.lbrace + 1, parseResult.plugins.rbrace)
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : [];

    const javaPresent = lines.some((line) =>
      line.match(/^\s*id\s+["']\s*java/)
    );
    if (!javaPresent) {
      const { userWillContinue } = await UI.prompt({
        type: 'list',
        name: 'userWillContinue',
        message: `The ${chalk.red(
          "'java'"
        )} plugin was not found. This configuration is unsupported and is likely to fail. Continue?`,
        default: 'Abort',
        choices: ['Abort', 'Continue'],
      });

      if (userWillContinue === 'Abort') {
        throw new AbortError('no java plugin found');
      }
    }

    // Missing plugin block, so no java plugin, but the user opted to continue.
    if (!parseResult.plugins) {
      const pluginsBlock = `
plugins {
${whitespace.padLine(pluginSpec)}
}
`;
      const buildscriptEnd = parseResult.buildscript
        ? parseResult.buildscript.rbrace + 1
        : parseResult.startOffset;
      const updatedSrc = [
        buildFileSource.substring(0, buildscriptEnd),
        pluginsBlock,
      ].join('\n');
      const offset = buildscriptEnd;
      return { updatedSrc, offset };
    }

    // Found plugin block, update it with plugin spec
    const existingIndex = lines.findIndex((line) =>
      line.match(/com\.appland\.appmap/)
    );

    if (existingIndex !== -1) {
      lines[existingIndex] = pluginSpec;
    } else {
      lines.push(pluginSpec);
    }

    const column = getColumn(buildFileSource, parseResult.plugins.lbrace);

    const updatedSrc = [
      buildFileSource.substring(0, parseResult.plugins.lbrace + 1),
      lines.map((l) => whitespace.padLine(l)).join('\n'),
    ].join('\n');
    const offset = parseResult.plugins.rbrace - 1;

    return { updatedSrc, offset };
  }

  /**
   * Ensure the build file contains a buildscript block with mavenCentral in its
   * repositories.
   *
   * Returns a portion of the updated source, including everything through the
   * rbrace of the buildscript block. Also returns the offset into the original
   * source from which copying should continue.
   */
  async insertRepository(
    buildFileSource: string,
    updatedSrc: string,
    offset: number,
    parseResult: GradleParseResult,
    whitespace: Whitespace
  ): Promise<{ updatedSrc: string; offset: number }> {
    if (parseResult.mavenPresent) {
      // mavenPresent means there's already a repositories block with
      // mavenCentral in it, so just copy the rest of the original.
      return { updatedSrc, offset };
    }

    const { addMavenCentral } = await UI.prompt({
      type: 'list',
      name: 'addMavenCentral',
      message:
        'The Maven Central repository is required by the AppMap plugin to fetch the AppMap agent JAR. Add it now?',
      choices: ['Yes', 'No'],
    });
    if (addMavenCentral !== 'Yes') {
      return { updatedSrc, offset };
    }

    const mavenCentral = `mavenCentral()`;
    if (!parseResult.repositories) {
      const repositoriesBlock = `
repositories {
${whitespace.padLine(mavenCentral)}
}
`;
      updatedSrc += repositoriesBlock;
      return { updatedSrc, offset };
    }

    updatedSrc = [
      updatedSrc,
      buildFileSource.substring(offset, parseResult.repositories.lbrace),
      whitespace.padLine(mavenCentral),
    ].join[''];
    offset = parseResult.repositories.rbrace;
    return { updatedSrc, offset };
  }

  async installAgent(): Promise<void> {
    const buildFileSource = (await fsp.readFile(this.buildFilePath)).toString();
    const parser = new GradleParser();
    const parseResult: GradleParseResult = parser.parse(buildFileSource);
    parser.checkSyntax(parseResult);
    const whitespace = getWhitespace(buildFileSource);

    let { updatedSrc, offset } = await this.insertPluginSpec(
      buildFileSource,
      parseResult,
      whitespace
    );

    ({ updatedSrc, offset } = await this.insertRepository(
      buildFileSource,
      updatedSrc,
      offset,
      parseResult,
      whitespace
    ));

    updatedSrc += buildFileSource.substring(offset);

    await fsp.writeFile(this.buildFilePath, updatedSrc);
  }
}
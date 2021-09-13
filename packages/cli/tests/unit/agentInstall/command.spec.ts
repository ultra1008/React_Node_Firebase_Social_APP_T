import path from 'path';
import fs from 'fs-extra';
import tmp from 'tmp';
import sinon from 'sinon';
import inquirer from 'inquirer';
import Telemetry from '../../../src/telemetry';
import yargs from 'yargs';

import * as commandRunner from '../../../src/cmds/agentInstaller/commandRunner';
import CommandStruct, {
  CommandReturn,
} from '../../../src/cmds/agentInstaller/commandStruct';

import UI from '../../../src/cmds/agentInstaller/userInteraction';

const fixtureDir = path.join(__dirname, '..', 'fixtures');
tmp.setGracefulCleanup();

const invokeCommand = (
  projectDir: string,
  projectType: string,
  evalResults: (err: Error | undefined, argv: any, output: string) => void
) => {
  const debugSwitch: string = ''; // to debug, set debugSwitch to -v

  if (debugSwitch !== '-v') {
    // Don't scribble on the console unless we're debugging.
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
    sinon.stub(UI, 'status').set(() => {});
  }

  return yargs
    .command(require('../../../src/cmds/agentInstaller/install-agent'))
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    })
    .parse(
      `install-agent ${debugSwitch} --dir ${projectDir} ${projectType}`,
      {},
      (err, argv, output) => {
        evalResults(err, argv, output);
      }
    );
};

describe('install-agent sub-command', () => {
  let projectDir: string;
  beforeEach(() => {
    sinon.stub(Telemetry);
    projectDir = tmp.dirSync({} as any).name;
  });

  afterEach(() => {
    // This bug https://github.com/sinonjs/sinon/issues/2384 acknowledges that
    // sinon.restore doesn't restore static methods. It suggests
    // sinon.restoreObject as a workaround, but restoreObject is currently
    // missing from @types/sinon. 
    //
    // This hacks around both problems:
    sinon['restoreObject'](Telemetry);
    sinon.restore();
  });

  describe('A Java project', () => {
    const testE2E = async (
      verifyAgent: (command: CommandStruct) => Promise<CommandReturn>,
      printPath: (command: CommandStruct) => Promise<CommandReturn>,
      initAgent: (command: CommandStruct) => Promise<CommandReturn>,
      validateAgent: (command: CommandStruct) => Promise<CommandReturn>,
      evalResults: (err: Error | undefined, argv: any, output: string) => void
    ) => {
      let callIdx = 0;
      sinon
        .stub(commandRunner, 'run')
        .onCall(callIdx++)
        .callsFake(verifyAgent)
        .onCall(callIdx++)
        .callsFake(printPath)
        .onCall(callIdx++)
        .callsFake(initAgent)
        .onCall(callIdx++)
        .callsFake(validateAgent);

      return invokeCommand(projectDir, 'Java', evalResults);
    };

    const expectedConfig = `
    # Fake appmap.yml
    name: fake-app
    packages:
    - com.fake.Fake
    `;

    const initAgent = (cmdStruct: CommandStruct) => {
      expect(cmdStruct.program).toEqual('java');
      const args = cmdStruct.args;
      expect(args).toEqual(['-jar', 'appmap.jar', '-d', projectDir, 'init']);
      const fakeConfig = `
    {
       "configuration": {
         "contents": "${expectedConfig.replace(/[\n]/g, '\\n')}"
       }
    }`;
      const ret = { stdout: fakeConfig, stderr: '' };
      return Promise.resolve(ret);
    };

    const validateAgent = (cmdStruct: CommandStruct) => {
      expect(cmdStruct.program).toEqual('java');
      const args = cmdStruct.args;
      expect(args).toEqual([
        '-jar',
        'appmap.jar',
        '-d',
        projectDir,
        'validate',
      ]);
      const ret = { stdout: '', stderr: '' };
      return Promise.resolve(ret);
    };

    describe('managed with gradle', () => {
      const projectFixture = path.join(
        fixtureDir,
        'java',
        'gradle',
        'example-project'
      );

      const verifyAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('./gradlew');
        expect(cmdStruct.args).toEqual([
          'dependencyInsight',
          '--dependency',
          'com.appland:appmap-agent',
          '--configuration',
          'appmapAgent',
        ]);
        const ret = {
          stdout: '',
          stderr: '',
        };
        return Promise.resolve(ret);
      };

      const printPath = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('./gradlew');
        expect(cmdStruct.args).toEqual(['appmap-print-jar-path']);
        const ret = {
          stdout: 'com.appland:appmap-agent.jar.path=appmap.jar',
          stderr: '',
        };
        return Promise.resolve(ret);
      };

      beforeEach(() => {
        fs.copySync(projectFixture, projectDir);
        sinon
          .stub(inquirer, 'prompt')
          .resolves({ addMavenCentral: 'Yes', result: 'Gradle' });
      });

      it('installs as expected', async () => {
        const evalResults = async (err, argv, output) => {
          expect(err).toBeNull();

          const actualConfig = await fs.readFile(
            path.join(projectDir, 'appmap.yml'),
            { encoding: 'utf-8' }
          );
          expect(actualConfig).toEqual(expectedConfig);
        };
        await testE2E(
          verifyAgent,
          printPath,
          initAgent,
          validateAgent,
          evalResults
        );
      });

      it('fails when validation fails', async () => {
        const msg = 'failValidate, validation failed';
        const failValidate = () => Promise.reject(new Error(msg));
        const evalResults = (err, argv, output) => {
          expect(err.message).toEqual(msg);
        };

        await testE2E(
          verifyAgent,
          printPath,
          initAgent,
          failValidate,
          evalResults
        );
      });
    });

    describe('managed with maven', () => {
      const projectFixture = path.join(
        fixtureDir,
        'java',
        'maven',
        'example-project'
      );

      const verifyAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('./mvnw');
        expect(cmdStruct.args).toEqual([
          '-Dplugin=com.appland:appmap-maven-plugin',
          'help:describe',
        ]);
        const ret = {
          stdout: '',
          stderr: '',
        };
        return Promise.resolve(ret);
      };

      const printPath = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('./mvnw');
        expect(cmdStruct.args).toEqual(['appmap:print-jar-path']);
        const ret = {
          stdout: 'com.appland:appmap-agent.jar.path=appmap.jar',
          stderr: '',
        };
        return Promise.resolve(ret);
      };

      beforeEach(() => {
        fs.copySync(projectFixture, projectDir);
        sinon.stub(inquirer, 'prompt').resolves({ result: 'Maven' });
      });

      it('installs as expected', async () => {
        const evalResults = async (err, argv, output) => {
          expect(err).toBeNull();

          const actualConfig = await fs.readFile(
            path.join(projectDir, 'appmap.yml'),
            { encoding: 'utf-8' }
          );
          expect(actualConfig).toEqual(expectedConfig);
        };
        await testE2E(
          verifyAgent,
          printPath,
          initAgent,
          validateAgent,
          evalResults
        );
      });

      it('fails when validation fails', async () => {
        const msg = 'failValidate, validation failed';
        const failValidate = () => Promise.reject(new Error(msg));
        const evalResults = (err, argv, output) => {
          expect(err.message).toEqual(msg);
        };

        await testE2E(
          verifyAgent,
          printPath,
          initAgent,
          failValidate,
          evalResults
        );
      });
    });
  });

  describe('A Ruby project', () => {
    const projectFixture = path.join(fixtureDir, 'ruby', 'app');

    beforeEach(() => {
      fs.copySync(projectFixture, projectDir);
    });

    const installAgent = (cmdStruct: CommandStruct) => {
      expect(cmdStruct.program).toEqual('bundle');
      const args = cmdStruct.args;
      expect(args).toEqual(['install']);
      const ret = { stdout: '', stderr: '' };
      return Promise.resolve(ret);
    };    

    const expectedConfig = `
# Fake appmap.yml
name: fake-app
packages:
- app/controllers
`;

    const initAgent = (cmdStruct: CommandStruct) => {
      expect(cmdStruct.program).toEqual('bundle');
      const args = cmdStruct.args;
      expect(args).toEqual(['exec', 'appmap-agent-init']);
      const fakeConfig = `
{
   "configuration": {
     "contents": "${expectedConfig.replace(/[\n]/g, '\\n')}"
   }
}`;
      const ret = { stdout: fakeConfig, stderr: '' };
      return Promise.resolve(ret);
    };

    const validateAgent = (cmdStruct: CommandStruct) => {
      expect(cmdStruct.program).toEqual('bundle');
      const args = cmdStruct.args;
      expect(args).toEqual(['exec', 'appmap-agent-validate']);
      const ret = { stdout: '', stderr: '' };
      return Promise.resolve(ret);
    };

    const testE2E = async (
      installAgent: (command: CommandStruct) => Promise<CommandReturn>,
      initAgent: (command: CommandStruct) => Promise<CommandReturn>,
      validateAgent: (command: CommandStruct) => Promise<CommandReturn>,
      evalResults: (err: Error | undefined, argv: any, output: string) => void
    ) => {
      let callIdx = 0;
      sinon
        .stub(commandRunner, 'run')
        .onCall(callIdx++)
        .callsFake(installAgent)
        .onCall(callIdx++)
        .callsFake(initAgent)
        .onCall(callIdx++)
        .callsFake(validateAgent);

      return invokeCommand(projectDir, 'Ruby', evalResults);
    };

    it('installs as expected', async () => {
      const evalResults = async (err, argv, output) => {
        expect(err).toBeNull();

        const actualConfig = await fs.readFile(
          path.join(projectDir, 'appmap.yml'),
          { encoding: 'utf-8' }
        );
        expect(actualConfig).toEqual(expectedConfig);
      };
      await testE2E(installAgent, initAgent, validateAgent, evalResults);
    });

    it('fails when validation fails', async () => {
      const msg = 'failValidate, validation failed';
      const failValidate = () => Promise.reject(new Error(msg));
      const evalResults = (err, argv, output) => {
        expect(err.message).toEqual(msg);
      };

      await testE2E(installAgent, initAgent, failValidate, evalResults);
    });
  });

  describe('A Python project', () => {
    const testE2E = async (
      installAgent: (command: CommandStruct) => Promise<CommandReturn>,
      initAgent: (command: CommandStruct) => Promise<CommandReturn>,
      evalResults: (err: Error | undefined, argv: any, output: string) => void
    ) => {

      let callIdx = 0;
      sinon.stub(commandRunner, 'run')
      .onCall(callIdx++).callsFake(installAgent)
      .onCall(callIdx++).callsFake(initAgent);

      return invokeCommand(projectDir, 'Python', evalResults);
    };

    const expectedConfig = `
# Fake appmap.yml
name: fake-app
packages:
- fake_app
    `;

    describe('managed with pip', () => {
      const projectFixture = path.join(fixtureDir, 'python', 'pip');

      beforeEach(() => {
        fs.copySync(projectFixture, projectDir);
        sinon.stub(inquirer, 'prompt').resolves({ result: 'pip' });
      });

      const installAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('pip');
        expect(cmdStruct.args).toEqual(['install', '-r', 'requirements.txt']);
        const ret = { stdout: '', stderr: '' };
        return Promise.resolve(ret);
      };

      const initAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('appmap-agent-init');
        expect(cmdStruct.args.length).toEqual(0);
        const fakeConfig = `
{
   "configuration": {
     "contents": "${expectedConfig.replace(/[\n]/g, '\\n')}"
   }
}`;
        const ret = { stdout: fakeConfig, stderr: '' };
        return Promise.resolve(ret);
      };

      it('installs as expected', async () => {
        const evalResults = async (err, argv, output) => {
          expect(err).toBeNull();

          const actualConfig = await fs.readFile(
            path.join(projectDir, 'appmap.yml'),
            { encoding: 'utf-8' }
          );
          expect(actualConfig).toEqual(expectedConfig);
        };
        await testE2E(installAgent, initAgent, evalResults);
      });
    });

    describe('managed with poetry', () => {
      const projectFixture = path.join(fixtureDir, 'python', 'poetry');

      beforeEach(() => {
        fs.copySync(projectFixture, projectDir);
        sinon.stub(inquirer, 'prompt').resolves({ result: 'poetry' });
      });

      const installAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('poetry');
        expect(cmdStruct.args).toEqual([ 'add', '--dev', '--allow-prereleases', 'appmap' ]);
        const ret = { stdout: '', stderr: '' };
        return Promise.resolve(ret);
      };


      const initAgent = (cmdStruct: CommandStruct) => {
        expect(cmdStruct.program).toEqual('poetry');
        expect(cmdStruct.args).toEqual(['run', 'appmap-agent-init']);
        const fakeConfig = `
{
   "configuration": {
     "contents": "${expectedConfig.replace(/[\n]/g, '\\n')}"
   }
}`;
        const ret = { stdout: fakeConfig, stderr: '' };
        return Promise.resolve(ret);
      };

      it('installs as expected', async () => {
        const evalResults = async (err, argv, output) => {
          expect(err).toBeNull();

          const actualConfig = await fs.readFile(
            path.join(projectDir, 'appmap.yml'),
            { encoding: 'utf-8' }
          );
          expect(actualConfig).toEqual(expectedConfig);
        };
        await testE2E(installAgent, initAgent, evalResults);
      });
    });
  });
});

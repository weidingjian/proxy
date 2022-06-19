import {execSync} from 'child_process';

export const execSyncWithStatus = (cmd: string) => {
    let stdout;
    let status = 0;
    try {
      stdout = execSync(cmd);
    } catch (err: any) {
      stdout = err.stdout || err.message;
      status = err.status || -1;
    }
  
    return {
      stdout: stdout.toString(),
      status,
    };
}
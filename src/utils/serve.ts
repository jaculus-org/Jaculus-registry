// Spawn the globally/locally installed `http-server` CLI to serve a folder.
// The child process runs until the user presses Ctrl+C (SIGINT).
import { spawn } from 'child_process';

export async function serveFolder(fsPath: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const args = [fsPath, '-p', String(port), '--cors'];

    console.log(`Starting http-server for ${fsPath} on port ${port}`);

    const child = spawn('http-server', args, {
      stdio: 'inherit',
    });

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      console.log(`http-server exited with code=${code} signal=${signal}`);
      resolve();
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    function sigintHandler() {
      // Forward SIGINT to child so it can exit gracefully
      try {
        child.kill('SIGINT');
      } catch {
        // ignore
      }
    }

    function cleanup() {
      process.removeListener('SIGINT', sigintHandler);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    }

    process.on('SIGINT', sigintHandler);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

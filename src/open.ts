import { spawn } from 'node:child_process';

/** Opens a file with the OS default handler (the browser, for .html). */
export function openFile(path: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', `"${path}"`]]
      : process.platform === 'darwin'
        ? ['open', [path]]
        : ['xdg-open', [path]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' });
  child.on('error', () => {});
  child.unref();
}

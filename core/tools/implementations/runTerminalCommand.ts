import iconv from "iconv-lite";
import childProcess from "node:child_process";
import util from "node:util";
// Automatically decode the buffer according to the platform to avoid garbled Chinese
function getDecodedOutput(data: Buffer): string {
  if (process.platform === "win32") {
    try {
      let out = iconv.decode(data, "utf-8");
      if (/�/.test(out)) {
        out = iconv.decode(data, "gbk");
      }
      return out;
    } catch {
      return iconv.decode(data, "gbk");
    }
  } else {
    return data.toString();
  }
}

import { fileURLToPath } from "node:url";
import { ToolImpl } from ".";
import {
  isProcessBackgrounded,
  removeBackgroundedProcess,
} from "../../util/processTerminalBackgroundStates";
import { getBooleanArg, getStringArg } from "../parseArgs";

const asyncExec = util.promisify(childProcess.exec);

// Add color-supporting environment variables
const getColorEnv = () => ({
  ...process.env,
  FORCE_COLOR: "1",
  COLORTERM: "truecolor",
  TERM: "xterm-256color",
  CLICOLOR: "1",
  CLICOLOR_FORCE: "1",
});

const ENABLED_FOR_REMOTES = [
  "",
  "local",
  "wsl",
  "dev-container",
  "devcontainer",
  "ssh-remote",
  "attached-container",
  "codespaces",
  "tunnel",
];

export const runTerminalCommandImpl: ToolImpl = async (args, extras) => {
  const command = getStringArg(args, "command");
  // Default to waiting for completion if not specified
  const waitForCompletion =
    getBooleanArg(args, "waitForCompletion", false) ?? true;

  const ideInfo = await extras.ide.getIdeInfo();
  const toolCallId = extras.toolCallId || "";

  if (ENABLED_FOR_REMOTES.includes(ideInfo.remoteName)) {
    // For streaming output
    if (extras.onPartialOutput) {
      return new Promise((resolve, reject) => {
        try {
          const getWorkspaceDirsPromise = extras.ide.getWorkspaceDirs();
          getWorkspaceDirsPromise
            .then((workspaceDirs) => {
              const cwd = fileURLToPath(workspaceDirs[0]);
              let terminalOutput = "";

              if (!waitForCompletion) {
                const status = "Command is running in the background...";
                if (extras.onPartialOutput) {
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: "",
                        status: status,
                      },
                    ],
                  });
                }
              }

              // Use spawn with color environment
              const childProc = childProcess.spawn(command, {
                cwd,
                shell: true,
                env: getColorEnv(), // Add enhanced environment for colors
              });

              childProc.stdout?.on("data", (data) => {
                // Skip if this process has been backgrounded
                if (isProcessBackgrounded(toolCallId)) return;

                const newOutput = getDecodedOutput(data);
                terminalOutput += newOutput;

                // Send partial output to UI
                if (extras.onPartialOutput) {
                  const status = waitForCompletion
                    ? ""
                    : "Command is running in the background...";
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                        status: status,
                      },
                    ],
                  });
                }
              });

              childProc.stderr?.on("data", (data) => {
                // Skip if this process has been backgrounded
                if (isProcessBackgrounded(toolCallId)) return;

                const newOutput = getDecodedOutput(data);
                terminalOutput += newOutput;

                // Send partial output to UI, status is not required
                if (extras.onPartialOutput) {
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                      },
                    ],
                  });
                }
              });

              // If we don't need to wait for completion, resolve immediately
              if (!waitForCompletion) {
                const status = "Command is running in the background...";
                resolve([
                  {
                    name: "Terminal",
                    description: "Terminal command output",
                    content: terminalOutput,
                    status: status,
                  },
                ]);
              }

              childProc.on("close", (code) => {
                // If this process has been backgrounded, clean it up from the map and return
                if (isProcessBackgrounded(toolCallId)) {
                  removeBackgroundedProcess(toolCallId);
                  return;
                }

                if (waitForCompletion) {
                  // Normal completion, resolve now
                  if (code === 0) {
                    const status = "Command completed";
                    resolve([
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                        status: status,
                      },
                    ]);
                  } else {
                    const status = `Command failed with exit code ${code}`;
                    resolve([
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                        status: status,
                      },
                    ]);
                  }
                } else {
                  // Already resolved, just update the UI with final output
                  if (extras.onPartialOutput) {
                    const status =
                      code === 0 || !code
                        ? "\nBackground command completed"
                        : `\nBackground command failed with exit code ${code}`;
                    extras.onPartialOutput({
                      toolCallId,
                      contextItems: [
                        {
                          name: "Terminal",
                          description: "Terminal command output",
                          content: terminalOutput,
                          status: status,
                        },
                      ],
                    });
                  }
                }
              });

              childProc.on("error", (error) => {
                // If this process has been backgrounded, clean it up from the map and return
                if (isProcessBackgrounded(toolCallId)) {
                  removeBackgroundedProcess(toolCallId);
                  return;
                }

                reject(error);
              });
            })
            .catch((error) => {
              reject(error);
            });
        } catch (error: any) {
          reject(error);
        }
      });
    } else {
      // Fallback to non-streaming for older clients
      const workspaceDirs = await extras.ide.getWorkspaceDirs();
      const cwd = fileURLToPath(workspaceDirs[0]);

      if (waitForCompletion) {
        // Standard execution, waiting for completion
        try {
          // Use color environment for exec as well
          const output = await asyncExec(command, {
            cwd,
            env: getColorEnv(),
          });
          const status = "Command completed";
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: output.stdout ?? "",
              status: status,
            },
          ];
        } catch (error: any) {
          const status = `Command failed with: ${error.message || error.toString()}`;
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: error.stderr ?? error.toString(),
              status: status,
            },
          ];
        }
      } else {
        // For non-streaming but also not waiting for completion, use spawn
        // but don't attach any listeners other than error
        try {
          // Use spawn with color environment
          const childProc = childProcess.spawn(command, {
            cwd,
            shell: true,
            env: getColorEnv(), // Add color environment
            // Detach the process so it's not tied to the parent
            detached: true,
            // Redirect to /dev/null equivalent (works cross-platform)
            stdio: "ignore",
          });

          // Even for detached processes, add event handlers to clean up the background process map
          childProc.on("close", () => {
            if (isProcessBackgrounded(toolCallId)) {
              removeBackgroundedProcess(toolCallId);
            }
          });

          childProc.on("error", () => {
            if (isProcessBackgrounded(toolCallId)) {
              removeBackgroundedProcess(toolCallId);
            }
          });

          // Unref the child to allow the Node.js process to exit
          childProc.unref();
          const status = "Command is running in the background...";
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: status,
              status: status,
            },
          ];
        } catch (error: any) {
          const status = `Command failed with: ${error.message || error.toString()}`;
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: status,
              status: status,
            },
          ];
        }
      }
    }
  }

  // For remote environments, just run the command
  // Note: waitForCompletion is not supported in remote environments yet
  await extras.ide.runCommand(command);
  return [
    {
      name: "Terminal",
      description: "Terminal command output",
      content:
        "Terminal output not available. This is only available in local development environments and not in SSH environments for example.",
      status: "Command failed",
    },
  ];
};

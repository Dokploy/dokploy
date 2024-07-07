import os from "node:os";

export const getShell = () => {
  switch (os.platform()) {
    case "win32":
      return "powershell.exe";
    case "darwin":
      return "zsh";
    default:
      return "bash";
  }
};

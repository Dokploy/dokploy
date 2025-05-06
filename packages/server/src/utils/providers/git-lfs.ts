import { execAsyncRemote } from "../process/execAsync";

export const setupGitLFS = async (cwd: string, serverId: string) => {
  try {
    // Install Git LFS in the repository
    await execAsyncRemote(serverId, `cd ${cwd} && git lfs install`);
    // Pull LFS objects
    await execAsyncRemote(serverId, `cd ${cwd} && git lfs pull`);
  } catch (error) {
    console.warn('Git LFS setup failed:', error);
    // Continue even if LFS fails as the repository might not use LFS
  }
};
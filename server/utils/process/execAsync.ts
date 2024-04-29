import { exec } from "node:child_process";
import util from "node:util";
export const execAsync = util.promisify(exec);

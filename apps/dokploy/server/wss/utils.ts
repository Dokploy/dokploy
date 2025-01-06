import { execAsync, paths } from "@dokploy/server";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

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

/** Returns private SSH key for dokploy local server terminal. Uses already created SSH key or generates a new SSH key.
 * 
 * In case of permission failures when running locally, run the command below:

```
sudo chown -R $USER:$USER /etc/dokploy/ssh
```

*/
export const setupLocalServerSSHKey = async () => {
	const { SSH_PATH } = paths(true);
	const sshKeyPath = path.join(SSH_PATH, "auto_generated-dokploy-local");

	if (!fs.existsSync(sshKeyPath)) {
		// Generate new SSH key if it hasn't been created yet
		await execAsync(`ssh-keygen -t rsa -b 4096 -f ${sshKeyPath} -N "" -C "dokploy-local-access"`);
	}

	const privateKey = fs.readFileSync(sshKeyPath, "utf8");

	return privateKey;
};

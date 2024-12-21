import { Client } from "ssh2";
import { findServerById } from "../services/server";

// Thanks for the idea to https://github.com/healthyhost/audit-vps-script/tree/main
const validateUfw = () => `
  if command -v ufw >/dev/null 2>&1; then
    isInstalled=true
    isActive=$(sudo ufw status | grep -q "Status: active" && echo true || echo false)
    defaultIncoming=$(sudo ufw status verbose | grep "Default:" | grep "incoming" | awk '{print $2}')
    echo "{\\"installed\\": $isInstalled, \\"active\\": $isActive, \\"defaultIncoming\\": \\"$defaultIncoming\\"}"
  else
    echo "{\\"installed\\": false, \\"active\\": false, \\"defaultIncoming\\": \\"unknown\\"}"
  fi
`;

const validateSsh = () => `
  if systemctl is-active --quiet sshd; then
    isEnabled=true
    hasKeyAuth=$(find "$HOME/.ssh" -type f -name "authorized_keys" 2>/dev/null | grep -q . && echo true || echo false)
    permitRootLogin=$(sudo sshd -T | grep -i "^PermitRootLogin" | awk '{print $2}')
    passwordAuth=$(sudo sshd -T | grep -i "^PasswordAuthentication" | awk '{print $2}')
    usePam=$(sudo sshd -T | grep -i "^UsePAM" | awk '{print $2}')
    echo "{\\"enabled\\": $isEnabled, \\"keyAuth\\": $hasKeyAuth, \\"permitRootLogin\\": \\"$permitRootLogin\\", \\"passwordAuth\\": \\"$passwordAuth\\", \\"usePam\\": \\"$usePam\\"}"
  else
    echo "{\\"enabled\\": false, \\"keyAuth\\": false, \\"permitRootLogin\\": \\"unknown\\", \\"passwordAuth\\": \\"unknown\\", \\"usePam\\": \\"unknown\\"}"
  fi
`;

const validateFail2ban = () => `
  if dpkg -l | grep -q "fail2ban"; then
    isInstalled=true
    isEnabled=$(systemctl is-enabled --quiet fail2ban.service && echo true || echo false)
    isActive=$(systemctl is-active --quiet fail2ban.service && echo true || echo false)
    
    if [ -f "/etc/fail2ban/jail.local" ]; then
      sshEnabled=$(grep -A10 "^\\[sshd\\]" /etc/fail2ban/jail.local | grep "enabled" | awk '{print $NF}' | tr -d '[:space:]')
      sshMode=$(grep -A10 "^\\[sshd\\]" /etc/fail2ban/jail.local | grep "^mode[[:space:]]*=[[:space:]]*aggressive" >/dev/null && echo "aggressive" || echo "normal")
      echo "{\\"installed\\": $isInstalled, \\"enabled\\": $isEnabled, \\"active\\": $isActive, \\"sshEnabled\\": \\"$sshEnabled\\", \\"sshMode\\": \\"$sshMode\\"}"
    else
      echo "{\\"installed\\": $isInstalled, \\"enabled\\": $isEnabled, \\"active\\": $isActive, \\"sshEnabled\\": \\"false\\", \\"sshMode\\": \\"normal\\"}"
    fi
  else
    echo "{\\"installed\\": false, \\"enabled\\": false, \\"active\\": false, \\"sshEnabled\\": \\"false\\", \\"sshMode\\": \\"normal\\"}"
  fi
`;

export const serverAudit = async (serverId: string) => {
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH Key found");
	}

	return new Promise<any>((resolve, reject) => {
		client
			.once("ready", () => {
				const bashCommand = `
          command_exists() {
            command -v "$@" > /dev/null 2>&1
          }

          ufwStatus=$(${validateUfw()})
          sshStatus=$(${validateSsh()})
          fail2banStatus=$(${validateFail2ban()})

          echo "{\\"ufw\\": $ufwStatus, \\"ssh\\": $sshStatus, \\"fail2ban\\": $fail2banStatus}"
        `;

				client.exec(bashCommand, (err, stream) => {
					if (err) {
						reject(err);
						return;
					}
					let output = "";
					stream
						.on("close", () => {
							client.end();
							try {
								const result = JSON.parse(output.trim());
								resolve(result);
							} catch (parseError) {
								reject(
									new Error(
										`Failed to parse output: ${parseError instanceof Error ? parseError.message : parseError}`,
									),
								);
							}
						})
						.on("data", (data: string) => {
							output += data;
						})
						.stderr.on("data", (data) => {});
				});
			})
			.on("error", (err) => {
				client.end();
				if (err.level === "client-authentication") {
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
						),
					);
				} else {
					reject(new Error(`SSH connection error: ${err.message}`));
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});
	});
};

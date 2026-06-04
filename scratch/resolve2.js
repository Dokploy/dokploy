const fs = require('fs');

function resolveDestinationRouter() {
    let content = fs.readFileSync('apps/dokploy/server/api/routers/destination.ts', 'utf8');
    content = content.replace(/<<<<<<< HEAD\r?\n[\s\S]*?=======\r?\n([\s\S]*?)\r?\n>>>>>>> [^\n]*\n/g, (match, p1) => {
        if (p1.includes('getRclonePathAndFlags')) {
            return `\t\t\t\tconst { flags: rcloneFlags, path: rcloneDestination } =\n\t\t\t\t\tawait getRclonePathAndFlags(\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\tsecretAccessKey,\n\t\t\t\t\t\t\tbucket,\n\t\t\t\t\t\t\tregion,\n\t\t\t\t\t\t\tendpoint,\n\t\t\t\t\t\t\taccessKey,\n\t\t\t\t\t\t\tprovider,\n\t\t\t\t\t\t} as any,\n\t\t\t\t\t\t"",\n\t\t\t\t\t);\n\n\t\t\t\trcloneFlags.push(`;
        }
        if (p1.includes('rcloneCommand')) {
            return `\t\t\t\t);\n\n\t\t\t\tif (additionalFlags?.length) {\n\t\t\t\t\trcloneFlags.push(...additionalFlags);\n\t\t\t\t}\n\t\t\t\tconst rcloneCommand = \`rclone ls \${rcloneFlags.join(" ")} \${quote([rcloneDestination])}\`;`;
        }
        return match;
    });
    fs.writeFileSync('apps/dokploy/server/api/routers/destination.ts', content);
}

function resolveUtils() {
    let content = fs.readFileSync('packages/server/src/utils/backups/utils.ts', 'utf8');
    content = content.replace(/<<<<<<< HEAD\r?\nimport \{ quote \} from "shell-quote";\r?\n=======\r?\nimport \{ exec \} from "node:child_process";\r?\nimport \{ promisify \} from "node:util";\r?\nconst execPromise = promisify\(exec\);\r?\n>>>>>>> [^\n]*\n/g, 
`import { quote } from "shell-quote";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFilePromise = promisify(execFile);
`);

    content = content.replace(/<<<<<<< HEAD\r?\n\tconst rcloneCommand = `rclone rcat \$\{rcloneFlags\.join\(" "\)\} "\$\{rcloneDestination\}"`;\r?\n\tconst rcloneDeleteCommand = `rclone deletefile \$\{rcloneFlags\.join\(" "\)\} "\$\{rcloneDestination\}"`;\r?\n=======\r?\n([\s\S]*?)>>>>>>> [^\n]*\n/g, 
`\tconst rcloneCommand = \`rclone rcat \${rcloneFlags.join(" ")} \${quote([rcloneDestination])}\`;
\tconst rcloneDeleteCommand = \`rclone deletefile \${rcloneFlags.join(" ")} \${quote([rcloneDestination])}\`;
$1`);

    content = content.replace(/<<<<<<< HEAD\r?\n=======[\s\S]*?>>>>>>> [^\n]*\n/g, ""); // Remove the other ones that just add `echo "Error: $BACKUP_OUTPUT"`
    
    // Now we need to manually fix obscurePassword and getRclonePathAndFlags
    content = content.replace(/export const obscurePassword = async \([\s\S]*?^\};/m, 
`export const obscurePassword = async (password: string) => {
\ttry {
\t\tconst { stdout } = await execFilePromise("rclone", ["obscure", password]);
\t\treturn stdout.trim();
\t} catch (error) {
\t\tlogger.error("Error obscuring password with rclone", error);
\t\treturn password;
\t}
};`);

    content = content.replace(/export const getRclonePathAndFlags = async \([\s\S]*?^\};/m, 
`const escapeRcloneParam = (val: string) => {
\tif (/[=,"]/.test(val)) {
\t\treturn \`"\${val.replace(/"/g, '\\"')}"\`;
\t}
\treturn val;
};

export const getRclonePathAndFlags = async (
\tdestination: Destination,
\tsubPath: string,
) => {
\tconst isS3 = !["sftp", "ftp"].includes(destination.provider || "");
\tif (isS3) {
\t\tconst flags = getS3Credentials(destination);
\t\tconst path = \`:s3:\${destination.bucket}/\${subPath}\`;
\t\treturn { flags, path };
\t}
\tconst provider = destination.provider;
\tconst obscuredPass = await obscurePassword(destination.secretAccessKey);
\tconst path = \`:\${provider},host=\${escapeRcloneParam(destination.endpoint)},port=\${escapeRcloneParam(destination.region)},user=\${escapeRcloneParam(destination.accessKey)},pass=\${escapeRcloneParam(obscuredPass)}:\${destination.bucket}/\${subPath}\`;
\treturn { flags: [], path };
};`);

    // We also need to fix getBackupCommand signature if it was messed up.
    // Wait, the conflict might have left it weird. Let's just fix it.
    content = content.replace(/export const getBackupCommand = \([\s\S]*?logPath: string,\r?\n\) => \{/g, 
`export const getBackupCommand = (
\tbackup: BackupSchedule,
\trcloneFlags: string[],
\trcloneDestination: string,
\tlogPath: string,
) => {`);

    fs.writeFileSync('packages/server/src/utils/backups/utils.ts', content);
}

resolveDestinationRouter();
resolveUtils();

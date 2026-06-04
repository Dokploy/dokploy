const fs = require('fs');

function resolveBackup(file) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace the conflict block
    content = content.replace(/<<<<<<< HEAD\r?\n[\s\S]*?=======\r?\n([\s\S]*?)\r?\n>>>>>>> [^\n]*\n/g, (match, p1) => {
        if (p1.includes('getRclonePathAndFlags')) {
            // It's the first conflict block
            return `\t\tconst { flags: rcloneFlags, path: rcloneDestination } =\n\t\t\tawait getRclonePathAndFlags(destination, bucketDestination);\n`;
        }
        if (p1.includes('rcloneCommand,')) {
            // It's the second conflict block
            return `\t\t\trcloneFlags,\n\t\t\trcloneDestination,\n`;
        }
        return match; // Unhandled conflict
    });

    // Also we need to make sure getBackupCommand gets the right args.
    // Instead of parsing the exact conflict, let's just replace the whole getBackupCommand invocation
    content = content.replace(/const backupCommand = getBackupCommand\([\s\S]*?deployment\.logPath,\r?\n\t\t\);/g,
`const backupCommand = getBackupCommand(
\t\t\tbackup,
\t\t\trcloneFlags,
\t\t\trcloneDestination,
\t\t\tdeployment.logPath,
\t\t);`);
    
    // Fix imports
    content = content.replace(/import \{.*?getS3Credentials.*?\} from "\.\/utils";/g, `import { getRclonePathAndFlags } from "./utils";`);
    content = content.replace(/import \{.*?getS3Credentials.*?\} from "\.\.\/backups\/utils";/g, `import { getRclonePathAndFlags } from "../backups/utils";`);

    fs.writeFileSync(file, content);
}

[
    'packages/server/src/utils/backups/compose.ts',
    'packages/server/src/utils/backups/libsql.ts',
    'packages/server/src/utils/backups/mariadb.ts',
    'packages/server/src/utils/backups/mongo.ts',
    'packages/server/src/utils/backups/mysql.ts',
    'packages/server/src/utils/backups/postgres.ts',
    'packages/server/src/utils/backups/web-server.ts',
].forEach(resolveBackup);

console.log("Backups resolved");

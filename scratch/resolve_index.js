const fs = require('fs');
let content = fs.readFileSync('packages/server/src/utils/backups/index.ts', 'utf8');
content = content.replace(/<<<<<<< HEAD\r?\n[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> [^\n]*\n/g, 
`import { redactRcloneCredentials } from "./redact";
import {
\tnormalizeS3Path,
\tscheduleBackup,
\tgetRclonePathAndFlags,
} from "./utils";\n`);
fs.writeFileSync('packages/server/src/utils/backups/index.ts', content);

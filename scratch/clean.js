const fs = require('fs');
let content = fs.readFileSync('packages/server/src/utils/backups/utils.ts', 'utf8');
content = content.replace(/<<<<<<< HEAD\r?\n[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> [^\n]*\n/g, 
`\techo "[$(date)] ✅ Backup uploaded to \${destinationType} successfully" >> \${logPath};\n`);
fs.writeFileSync('packages/server/src/utils/backups/utils.ts', content);

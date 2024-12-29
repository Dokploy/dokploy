import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateTestData(numEntries: number) {
    const entries = [];
    const now = new Date();
    const baseTime = new Date(now.getTime() - 30000); // 30 seconds ago
    
    for (let i = 0; i < numEntries; i++) {
        // Distribute entries over the last 30 seconds
        const timestamp = new Date(baseTime.getTime() + (i * (30000 / numEntries)));
        entries.push(JSON.stringify({
            timestamp: timestamp.toISOString(),
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            disk: Math.random() * 100
        }));
    }
    
    await fs.writeFile(
        path.join(__dirname, 'test-metrics.log'),
        entries.join('\n'),
        'utf8'
    );

    console.log(`Generated ${numEntries} test entries over the last 30 seconds`);
}

// Generate 1 million entries
generateTestData(1_000_000);

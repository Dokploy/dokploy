import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import fs from "fs";

export interface S3BackupConfig {
endpoint?: string;
region: string;
bucket: string;
accessKeyId: string;
secretAccessKey: string;
}

export class S3BackupProvider {
private client: S3Client;
private bucket: string;

constructor(config: S3BackupConfig) {
this.bucket = config.bucket;
this.client = new S3Client({
region: config.region,
endpoint: config.endpoint || undefined,
credentials: {
accessKeyId: config.accessKeyId,
secretAccessKey: config.secretAccessKey,
},
forcePathStyle: Boolean(config.endpoint),
});
}

async uploadBackup(key: string, filePath: string): Promise<void> {
const fileStream = fs.createReadStream(filePath);
await this.client.send(
new PutObjectCommand({
Bucket: this.bucket,
Key: key,
Body: fileStream,
})
);
}
}

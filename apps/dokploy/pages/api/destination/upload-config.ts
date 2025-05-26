import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const destinationId = req.query.destinationId as string;
  if (!destinationId) {
    return res.status(400).json({ error: 'Missing destinationId' });
  }
  const uploadDir = path.join(process.cwd(), 'data', 'rclone-configs');
  ensureDir(uploadDir);
  const form = new formidable.IncomingForm({ uploadDir, keepExtensions: true });
  form.parse(req, (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Upload error' });
    const file = files.file as formidable.File;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const savePath = path.join(uploadDir, `${destinationId}.conf`);
    fs.renameSync(file.filepath, savePath);
    res.status(200).json({ path: savePath });
  });
} 
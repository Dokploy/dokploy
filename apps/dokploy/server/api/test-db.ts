import { NextApiRequest, NextApiResponse } from "next";
import { db } from "../db";
import { sql } from "drizzle-orm";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // Check if canReadOnlyServices column exists
    const columnCheck = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'member' 
      AND column_name = 'canReadOnlyServices'
    `);
    
    console.log('Column check result:', columnCheck);
    
    // Test the column by selecting from member table
    const testResult = await db.execute(sql`SELECT "canReadOnlyServices" FROM "member" LIMIT 1`);
    console.log('Test query result:', testResult);
    
    // Check a specific member
    const memberResult = await db.execute(sql`
      SELECT id, "canReadOnlyServices", "canCreateProjects" 
      FROM "member" 
      WHERE "userId" = 'Rp7RigazTmYVFswrP6AfSGwvln6owr5f'
    `);
    console.log('Specific member result:', memberResult);
    
    res.status(200).json({ 
      success: true, 
      columnExists: columnCheck.length > 0,
      columnDetails: columnCheck,
      testResult,
      memberResult
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkMigration() {
  try {
    // Check if pausedAt column exists in application table
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'application' 
      AND column_name = 'pausedAt'
    `);
    
    console.log("pausedAt column exists:", result.rows.length > 0);
    
    // Check if 'paused' status exists in enum
    const enumResult = await db.execute(sql`
      SELECT enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'applicationStatus'
      AND enumlabel = 'paused'
    `);
    
    console.log("'paused' status exists in enum:", enumResult.rows.length > 0);
    
    process.exit(0);
  } catch (error) {
    console.error("Error checking migration:", error);
    process.exit(1);
  }
}

checkMigration();

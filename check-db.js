const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

async function checkDatabase() {
  // Use the same connection string as the app
  const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/dokploy';
  
  const client = postgres(connectionString);
  const db = drizzle(client);

  try {
    // Check if canReadOnlyServices column exists
    const result = await client`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'member' 
      AND column_name = 'canReadOnlyServices'
    `;
    
    console.log('Column check result:', result);
    
    if (result.length === 0) {
      console.log('❌ Column does not exist, adding it...');
      await client`ALTER TABLE "member" ADD COLUMN "canReadOnlyServices" boolean DEFAULT false NOT NULL`;
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ Column already exists:', result[0]);
    }
    
    // Test the column by selecting from member table
    const testResult = await client`SELECT "canReadOnlyServices" FROM "member" LIMIT 1`;
    console.log('Test query result:', testResult);
    
    // Check a specific member
    const memberResult = await client`
      SELECT id, "canReadOnlyServices", "canCreateProjects" 
      FROM "member" 
      WHERE "userId" = 'Rp7RigazTmYVFswrP6AfSGwvln6owr5f'
    `;
    console.log('Specific member result:', memberResult);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkDatabase();

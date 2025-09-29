-- Force add canReadOnlyServices column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'member' 
        AND column_name = 'canReadOnlyServices'
    ) THEN
        ALTER TABLE "member" ADD COLUMN "canReadOnlyServices" boolean DEFAULT false NOT NULL;
    END IF;
END $$;

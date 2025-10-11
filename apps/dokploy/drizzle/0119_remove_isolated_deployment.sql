-- Migration 119: Remove isolatedDeployment feature
--
-- This migration removes the obsolete isolatedDeployment column after
-- Migration 118 converted all isolated deployments to use customNetworkIds.
--
-- The isolatedDeployment feature has been fully replaced by the network
-- management system using customNetworkIds.

-- Drop the isolatedDeployment column from compose table
ALTER TABLE compose DROP COLUMN IF EXISTS "isolatedDeployment";

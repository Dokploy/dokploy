import { NextApiRequest, NextApiResponse } from 'next';
import { findGiteaById } from '@dokploy/server';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { giteaId } = req.query;

    if (!giteaId || Array.isArray(giteaId)) {
      return res.status(400).json({ error: 'Invalid Gitea provider ID' });
    }

    let gitea;
    try {
      gitea = await findGiteaById(giteaId);
    } catch (findError) {
      console.error('Error finding Gitea provider:', findError);
      return res.status(404).json({ error: 'Failed to find Gitea provider' });
    }

    if (!gitea.clientId || !gitea.redirectUri) {
      return res.status(400).json({ 
        error: 'Incomplete OAuth configuration',
        missingClientId: !gitea.clientId,
        missingRedirectUri: !gitea.redirectUri
      });
    }

    // Use the state parameter to pass the giteaId
    // This is more secure than adding it to the redirect URI
    const state = giteaId;
    
    const authorizationUrl = new URL(`${gitea.giteaUrl}/login/oauth/authorize`);
    authorizationUrl.searchParams.append('client_id', gitea.clientId);
    authorizationUrl.searchParams.append('response_type', 'code');
    authorizationUrl.searchParams.append('redirect_uri', gitea.redirectUri);
    authorizationUrl.searchParams.append('scope', 'read:user repo');
    authorizationUrl.searchParams.append('state', state);

    // Redirect the user to the Gitea authorization page
    res.redirect(307, authorizationUrl.toString());
  } catch (error) {
    console.error('Error initiating Gitea OAuth flow:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
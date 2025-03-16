import { NextApiRequest, NextApiResponse } from 'next';
import { findGiteaById, updateGitea } from '@dokploy/server';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    console.log('Full Callback Request:', {
      query: req.query,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    const { code, state } = req.query;

    // Verify received parameters
    console.log('Received Parameters:', {
      code: code ? 'Present' : 'Missing',
      state: state ? 'Present' : 'Missing'
    });

    if (!code || Array.isArray(code)) {
      console.error('Invalid code:', code);
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Invalid authorization code')}`
      );
    }

    // The state parameter now contains the giteaId
    if (!state || Array.isArray(state)) {
      console.error('Invalid state parameter:', state);
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Invalid state parameter')}`
      );
    }

    // Extract the giteaId from the state parameter
    let giteaId: string;
    try {
      // The state could be a simple string or a JSON object
      if (state.startsWith('{') && state.endsWith('}')) {
        const stateObj = JSON.parse(state);
        giteaId = stateObj.giteaId;
      } else {
        giteaId = state;
      }

      if (!giteaId) {
        throw new Error('giteaId not found in state parameter');
      }
    } catch (parseError) {
      console.error('Error parsing state parameter:', parseError);
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Invalid state format')}`
      );
    }

    let gitea;
    try {
      gitea = await findGiteaById(giteaId);
    } catch (findError) {
      console.error('Error finding Gitea provider:', findError);
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Failed to find Gitea provider')}`
      );
    }

    // Extensive logging of Gitea provider details
    console.log('Gitea Provider Details:', {
      id: gitea.giteaId,
      url: gitea.giteaUrl,
      clientId: gitea.clientId ? 'Present' : 'Missing',
      clientSecret: gitea.clientSecret ? 'Present' : 'Missing',
      redirectUri: gitea.redirectUri
    });

    // Validate required OAuth parameters
    if (!gitea.clientId || !gitea.clientSecret) {
      console.error('Missing OAuth configuration:', {
        hasClientId: !!gitea.clientId,
        hasClientSecret: !!gitea.clientSecret
      });
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Incomplete OAuth configuration')}`
      );
    }

    const response = await fetch(`${gitea.giteaUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        client_id: gitea.clientId as string,
        client_secret: gitea.clientSecret as string,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: gitea.redirectUri || '',
      }),
    });

    // Log raw response details
    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response:', {
        error: parseError,
        responseText
      });
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Failed to parse token response')}`
      );
    }

    if (!response.ok) {
      console.error('Gitea token exchange failed:', {
        result,
        responseStatus: response.status
      });
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent(result.error || 'Token exchange failed')}`
      );
    }

    // Validate token response
    if (!result.access_token) {
      console.error('Missing access token in response:', {
        fullResponse: result
      });
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('No access token received')}`
      );
    }

    const expiresAt = result.expires_in
      ? Math.floor(Date.now() / 1000) + result.expires_in
      : null;

    try {
      // Perform the update
      const updatedGitea = await updateGitea(gitea.giteaId, {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt,
        ...(result.organizationName ? { organizationName: result.organizationName } : {}),
      });

      // Log successful update
      console.log('Gitea provider updated successfully:', {
        hasAccessToken: !!updatedGitea.accessToken,
        hasRefreshToken: !!updatedGitea.refreshToken,
        expiresAt: updatedGitea.expiresAt
      });

      return res.redirect(307, "/dashboard/settings/git-providers?connected=true");
    } catch (updateError) {
      console.error('Failed to update Gitea provider:', {
        error: updateError,
        giteaId: gitea.giteaId
      });
      return res.redirect(
        307, 
        `/dashboard/settings/git-providers?error=${encodeURIComponent('Failed to store access token')}`
      );
    }
  } catch (error) {
    console.error('Comprehensive Callback Error:', error);
    return res.redirect(
      307, 
      `/dashboard/settings/git-providers?error=${encodeURIComponent('Internal server error')}`
    );
  }
}
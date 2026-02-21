import { Request, Response } from 'express';
import { getOIDCConfig, client } from '../../auth/config';

export async function logout(req: Request, res: Response): Promise<void> {
  const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const postLogoutRedirectUri = `${frontendOrigin}/login`;

  try {
    // Destroy session
    req.session.destroy((err) => {
      /* istanbul ignore if -- Session destroy callback error rarely occurs */
      if (err) {
        console.error('Session destroy error:', err);
      }
    });

    // Clear session cookie
    res.clearCookie('deps-dashboard.sid');

    // In local auth mode, just return the login URL
    if (process.env.LOCAL_AUTH === 'true') {
      res.json({ redirectUrl: '/login' });
      return;
    }

    // Try to get OIDC end session URL
    try {
      const config = getOIDCConfig();
      const endSessionUrl = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: postLogoutRedirectUri,
      });
      res.json({ redirectUrl: endSessionUrl.href });
    } catch {
      // OIDC provider may not support end_session_endpoint
      res.json({ redirectUrl: '/login' });
    }
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors during logout */ {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

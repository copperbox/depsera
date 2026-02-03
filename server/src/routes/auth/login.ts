import { Request, Response } from 'express';
import {
  getOIDCConfig,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  client,
} from '../../auth/config';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    // In bypass mode, just redirect to home (user is auto-authenticated)
    /* istanbul ignore if -- AUTH_BYPASS mode tested separately */
    if (process.env.AUTH_BYPASS === 'true') {
      const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
      const returnTo = (req.query.returnTo as string) || '/';
      res.redirect(`${frontendOrigin}${returnTo}`);
      return;
    }

    const config = getOIDCConfig();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE and state in session
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.returnTo = (req.query.returnTo as string) || '/';

    const redirectUri = process.env.OIDC_REDIRECT_URI || 'http://localhost:3001/api/auth/callback';

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    res.redirect(authUrl.href);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to initiate login' });
  }
}

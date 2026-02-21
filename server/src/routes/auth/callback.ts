import { Request, Response } from 'express';
import crypto from 'crypto';
import { getOIDCConfig, client } from '../../auth/config';
import { getStores } from '../../stores';

/**
 * Timing-safe comparison for OIDC state parameter.
 * Prevents timing attacks that could leak information about the expected state value.
 */
function timingSafeStateCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export async function callback(req: Request, res: Response): Promise<void> {
  const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

  try {
    const config = getOIDCConfig();

    // Build the current URL from the request
    const currentUrl = new URL(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`
    );

    // Validate state using timing-safe comparison
    const state = currentUrl.searchParams.get('state');
    if (!timingSafeStateCompare(state, req.session.state)) {
      console.error('State mismatch:', { expected: req.session.state, received: state });
      res.redirect(`${frontendOrigin}/login?error=state_mismatch`);
      return;
    }

    // Exchange code for tokens using PKCE
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: req.session.codeVerifier,
      expectedState: req.session.state,
    });

    // Get user info from OIDC provider
    const claims = tokens.claims();
    const sub = claims?.sub;
    if (!sub) {
      throw new Error('No subject in token claims');
    }
    const userinfo = await client.fetchUserInfo(config, tokens.access_token, sub);


    // Find or create user
    const stores = getStores();
    let user = stores.users.findByOidcSubject(sub);

    if (!user) {
      // Check if this is the first user (bootstrap admin)
      const userCount = stores.users.count();
      const isFirstUser = userCount === 0;

      const email = (userinfo.email as string) || `${sub}@unknown`;
      const name = (userinfo.name as string) || (userinfo.preferred_username as string) || 'Unknown User';
      const role = isFirstUser ? 'admin' : 'user';

      user = stores.users.create({
        email,
        name,
        oidc_subject: sub,
        role,
      });

      if (isFirstUser) {
        console.log(`First user ${user.email} bootstrapped as admin`);
        /* istanbul ignore else -- Non-first user creation; tested via integration */
      } else {
        console.log(`New user created: ${user.email}`);
      }
    } else {
      // Update name/email if changed in OIDC provider
      const newEmail = (userinfo.email as string) || user.email;
      const newName = (userinfo.name as string) || (userinfo.preferred_username as string) || user.name;

      if (newEmail !== user.email || newName !== user.name) {
        const updated = stores.users.update(user.id, {
          email: newEmail,
          name: newName,
        });
        if (updated) {
          user = updated;
        }
      }
    }

    // Clear OIDC session data
    const returnTo = req.session.returnTo || '/';
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.returnTo;

    // Set authenticated session
    req.session.userId = user.id;

    res.redirect(`${frontendOrigin}${returnTo}`);
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect(`${frontendOrigin}/login?error=auth_failed`);
  }
}

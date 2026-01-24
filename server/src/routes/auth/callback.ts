import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getOIDCConfig, client } from '../../auth/config';
import db from '../../db';
import { User } from '../../db/types';

export async function callback(req: Request, res: Response): Promise<void> {
  const frontendOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

  try {
    const config = getOIDCConfig();

    // Build the current URL from the request
    const currentUrl = new URL(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`
    );

    // Validate state
    const state = currentUrl.searchParams.get('state');
    if (state !== req.session.state) {
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
    let user = db
      .prepare('SELECT * FROM users WHERE oidc_subject = ?')
      .get(sub) as User | undefined;

    if (!user) {
      // Check if this is the first user (bootstrap admin)
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const isFirstUser = userCount.count === 0;

      const id = randomUUID();
      const email = (userinfo.email as string) || `${sub}@unknown`;
      const name = (userinfo.name as string) || (userinfo.preferred_username as string) || 'Unknown User';
      const role = isFirstUser ? 'admin' : 'user';

      db.prepare(`
        INSERT INTO users (id, email, name, oidc_subject, role, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(id, email, name, sub, role);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;

      if (isFirstUser) {
        console.log(`First user ${user.email} bootstrapped as admin`);
      } else {
        console.log(`New user created: ${user.email}`);
      }
    } else {
      // Update name/email if changed in OIDC provider
      const newEmail = (userinfo.email as string) || user.email;
      const newName = (userinfo.name as string) || (userinfo.preferred_username as string) || user.name;

      if (newEmail !== user.email || newName !== user.name) {
        db.prepare(`
          UPDATE users SET email = ?, name = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newEmail, newName, user.id);

        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User;
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

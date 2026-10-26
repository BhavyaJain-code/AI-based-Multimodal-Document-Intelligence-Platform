const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

class AuthService {
  constructor() {
    this.users = new Map();
    this.sessions = new Map(); // token -> { userId, role, workspace, loggedInAt }
    this.loadUsers();
  }

  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  }

  loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const u of data) {
          this.users.set(u.userId.toLowerCase(), u);
        }
      }
    } catch (err) {
      console.warn('[Auth] Could not load users file, using memory store.');
    }

    // Ensure default demo user exists
    const demoEmail = 'analyst@enterprise.com';
    if (!this.users.has(demoEmail)) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = this.hashPassword('Password123', salt);
      const defaultUser = {
        userId: demoEmail,
        salt,
        passwordHash,
        role: 'Data Analyst',
        workspace: 'Enterprise Operations',
        createdAt: new Date().toISOString()
      };
      this.users.set(demoEmail, defaultUser);
      this.saveUsers();
    }
  }

  saveUsers() {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Auth] Failed to persist users:', err.message);
    }
  }

  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  }

  validateCredentials(userId, password) {
    if (!userId || !this.isValidEmail(userId)) {
      return { valid: false, message: 'Please provide a valid email address (e.g. user@example.com).' };
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long.' };
    }

    // Must contain at least one letter and one number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return { valid: false, message: 'Password must contain at least one letter and at least one number.' };
    }

    return { valid: true };
  }

  register(userId, password, role = 'Data Analyst', workspace = 'Enterprise Operations') {
    const val = this.validateCredentials(userId, password);
    if (!val.valid) {
      throw new Error(val.message);
    }

    const key = userId.trim().toLowerCase();
    if (this.users.has(key)) {
      throw new Error('An account with this email address already exists. Please sign in or use another email.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const newUser = {
      userId: userId.trim(),
      salt,
      passwordHash,
      role: role || 'Data Analyst',
      workspace: workspace || 'Enterprise Operations',
      createdAt: new Date().toISOString()
    };

    this.users.set(key, newUser);
    this.saveUsers();

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      userId: newUser.userId,
      role: newUser.role,
      workspace: newUser.workspace,
      loggedInAt: new Date().toISOString()
    });

    return {
      token,
      user: {
        userId: newUser.userId,
        role: newUser.role,
        workspace: newUser.workspace
      }
    };
  }

  login(userId, password) {
    if (!userId || !password) {
      throw new Error('Please provide both email address and password.');
    }

    if (!this.isValidEmail(userId)) {
      throw new Error('Please provide a valid email address.');
    }

    const key = userId.trim().toLowerCase();
    const user = this.users.get(key);
    if (!user) {
      throw new Error('Invalid email address or password.');
    }

    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      throw new Error('Invalid email address or password.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      userId: user.userId,
      role: user.role,
      workspace: user.workspace,
      loggedInAt: new Date().toISOString()
    });

    return {
      token,
      user: {
        userId: user.userId,
        role: user.role,
        workspace: user.workspace
      }
    };
  }

  verifySession(token) {
    if (!token) return null;
    return this.sessions.get(token) || null;
  }

  logout(token) {
    if (token) {
      this.sessions.delete(token);
    }
    return true;
  }
}

module.exports = new AuthService();

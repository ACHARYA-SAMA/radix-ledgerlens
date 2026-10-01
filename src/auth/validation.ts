// ========================================
// Validation — shared client + server
// ========================================

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

export interface PasswordRule {
  id: string;
  label: string;
  passed: boolean;
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordValidationResult {
  rules: PasswordRule[];
  strength: PasswordStrength;
  allPassed: boolean;
}

// ----- Constants -----

const COMMON_PASSWORDS = [
  'password', 'password123', 'password1', '123456', '12345678', '123456789',
  'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome', 'monkey',
  'dragon', 'master', 'login', 'princess', 'admin', 'passw0rd',
  'iloveyou', 'sunshine', 'trustno1', 'batman', 'shadow', 'ashley',
  '1234567890', 'football', 'baseball', 'soccer', 'charlie', 'michael',
];

const DOMAIN_CORRECTIONS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outllook.com': 'outlook.com', 'outlook.con': 'outlook.com',
};

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// ----- Email -----

export function validateEmail(raw: string): EmailValidationResult {
  const email = (raw || '').trim().toLowerCase();

  if (!email) {
    return { valid: false, error: 'Email is required.' };
  }
  if (email.length > 254) {
    return { valid: false, error: 'Email is too long (max 254 characters).' };
  }
  if (/\s/.test(email)) {
    return { valid: false, error: 'Email must not contain spaces.' };
  }

  const atParts = email.split('@');
  if (atParts.length !== 2) {
    return { valid: false, error: 'Email must contain exactly one "@".' };
  }

  const [localPart, domain] = atParts;

  if (!localPart) {
    return { valid: false, error: 'Missing username before "@".' };
  }
  if (/\.\./.test(localPart)) {
    return { valid: false, error: 'Username must not contain consecutive dots.' };
  }
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return { valid: false, error: 'Username must not start or end with a dot.' };
  }

  if (!domain || !domain.includes('.')) {
    return { valid: false, error: 'Missing or invalid domain.' };
  }
  if (/\.\./.test(domain)) {
    return { valid: false, error: 'Domain must not contain consecutive dots.' };
  }

  const tld = domain.split('.').pop() || '';
  if (tld.length < 2) {
    return { valid: false, error: 'Domain TLD must be at least 2 characters.' };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: 'Invalid email format.' };
  }

  // Check for typo suggestion
  const suggestion = DOMAIN_CORRECTIONS[domain];
  if (suggestion) {
    return {
      valid: true,
      suggestion: `${localPart}@${suggestion}`,
    };
  }

  return { valid: true };
}

// ----- Password -----

export function validatePassword(password: string, email: string = ''): PasswordValidationResult {
  const localPart = email.includes('@') ? email.split('@')[0] : '';

  const rules: PasswordRule[] = [
    {
      id: 'length',
      label: 'At least 12 characters',
      passed: password.length >= 12,
    },
    {
      id: 'uppercase',
      label: 'One uppercase letter',
      passed: /[A-Z]/.test(password),
    },
    {
      id: 'lowercase',
      label: 'One lowercase letter',
      passed: /[a-z]/.test(password),
    },
    {
      id: 'number',
      label: 'One number',
      passed: /[0-9]/.test(password),
    },
    {
      id: 'special',
      label: 'One special character',
      passed: /[^A-Za-z0-9]/.test(password),
    },
    {
      id: 'noEmailPart',
      label: 'Not contain email username',
      passed:
        localPart.length < 3 ||
        !password.toLowerCase().includes(localPart.toLowerCase()),
    },
    {
      id: 'notCommon',
      label: 'Not a common password',
      passed: password.length > 0 && !COMMON_PASSWORDS.includes(password.toLowerCase()),
    },
    {
      id: 'noRepeat',
      label: 'No 3+ repeated characters',
      passed: password.length > 0 && !/(.)\1{2,}/.test(password),
    },
  ];

  const passedCount = rules.filter((r) => r.passed).length;

  // Strength calculation with length bonus
  let effectiveCount = passedCount;
  if (password.length > 16) effectiveCount += 1;
  if (password.length > 20) effectiveCount += 1;

  let strength: PasswordStrength = 'weak';
  if (effectiveCount >= 4) strength = 'fair';
  if (effectiveCount >= 6) strength = 'good';
  if (effectiveCount >= 8) strength = 'strong';

  return {
    rules,
    strength,
    allPassed: passedCount === rules.length,
  };
}

// ----- Password match -----

export function validatePasswordMatch(
  password: string,
  confirm: string
): boolean {
  return password.length > 0 && password === confirm;
}

// ----- Generate strong password -----

export function generateStrongPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*_+-=?';
  const all = upper + lower + digits + special;

  const getSecureRandom = (max: number): number => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  };

  // Start with one of each required type
  const required = [
    upper[getSecureRandom(upper.length)],
    lower[getSecureRandom(lower.length)],
    digits[getSecureRandom(digits.length)],
    special[getSecureRandom(special.length)],
  ];

  // Fill the remaining 12 characters randomly
  const remaining: string[] = [];
  for (let i = 0; i < 12; i++) {
    remaining.push(all[getSecureRandom(all.length)]);
  }

  // Combine and shuffle using Fisher-Yates
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getSecureRandom(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

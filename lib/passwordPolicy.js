// File: /lib/passwordPolicy.js

/**
 * Password validation rules and corresponding messages.
 * You can update the rules and messages here any time.
 */

export const passwordRules = [
  {
    id: 'minLength',
    test: (password) => typeof password === 'string' && password.length >= 8,
    message: 'Use at least 8 characters',
  },
  {
    id: 'hasUppercase',
    test: (password) => /[A-Z]/.test(password),
    message: 'Include at least one uppercase letter',
  },
  {
    id: 'hasLowercase',
    test: (password) => /[a-z]/.test(password),
    message: 'Include at least one lowercase letter',
  },
  {
    id: 'hasDigit',
    test: (password) => /\d/.test(password),
    message: 'Include at least one number',
  },
  // Add more rules if needed, e.g. special chars:
  // {
  //   id: 'hasSpecialChar',
  //   test: (password) => /[!@#$%^&*(),.?":{}|<>]/.test(password),
  //   message: 'Include at least one special character',
  // },
];

/**
 * Validate a password against all rules.
 * @param {string} password
 * @returns {boolean} true if password passes all rules, false otherwise
 */
export function isValidPassword(password) {
  return passwordRules.every(rule => rule.test(password));
}

/**
 * Returns an array of rule objects with their pass/fail status.
 * Useful for frontend to display which rules passed/failed.
 * 
 * @param {string} password
 * @returns {Array<{id: string, passed: boolean, message: string}>}
 */
export function getPasswordValidationStatus(password) {
  return passwordRules.map(rule => ({
    id: rule.id,
    passed: rule.test(password),
    message: rule.message,
  }));
}

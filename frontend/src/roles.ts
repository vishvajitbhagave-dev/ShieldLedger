import type { Role } from './context.js';

/** The three selectable user roles, shared by the header role switcher and the Profile page. */
export const ROLE_DEFS: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'sme', label: 'SME' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'lender', label: 'Lender' },
];
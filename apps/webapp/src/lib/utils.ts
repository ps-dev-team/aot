import { clsx, type ClassValue } from 'clsx';

/** Class merger. No tailwind-merge: the primitives here are small enough that conflicts are a bug to fix, not to paper over. */
export const cn = (...inputs: ClassValue[]) => clsx(inputs);

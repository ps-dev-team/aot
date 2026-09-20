import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const base =
  'w-full min-w-0 border border-rule bg-panel-2 px-[10px] py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-faint ' +
  'focus:border-brass focus:outline-none disabled:cursor-not-allowed disabled:text-ink-faint';

/** The prototype's text field (`.row input[type=text]`): panel-2 fill, rule border, brass on focus. */
export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(base, className)} {...props} />
);

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(base, 'min-h-24 resize-y leading-relaxed', className)} {...props} />
);

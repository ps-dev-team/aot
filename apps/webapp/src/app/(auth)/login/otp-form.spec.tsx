// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock('../otp-actions', () => ({ requestCode: actions.send, verifyCode: actions.verify }));
import { OtpForm } from './otp-form';
beforeEach(() => {
  actions.send.mockReset().mockResolvedValue({ sent: true, email: 'test@example.com' });
  actions.verify.mockReset().mockResolvedValue({ error: 'Invalid code' });
});
afterEach(cleanup);
it('replaces email entry with code entry, resends to the same address, and supports going back', async () => {
  render(<OtpForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'test@example.com' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Send sign-in code' }).closest('form') as HTMLFormElement,
  );
  await screen.findByRole('textbox', { name: 'Email code' });
  expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
  fireEvent.submit(
    screen.getByRole('button', { name: 'Resend code' }).closest('form') as HTMLFormElement,
  );
  await waitFor(() => expect(actions.send).toHaveBeenCalledTimes(2));
  expect(actions.send.mock.calls[1][1].get('email')).toBe('test@example.com');
  await screen.findByText('If this address can sign in, a new code will arrive shortly.');
  fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
  expect(screen.queryByRole('textbox', { name: 'Email code' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
});
it('stays on email entry if delivery fails', async () => {
  actions.send.mockResolvedValue({ error: 'Unable to send a code.' });
  render(<OtpForm />);
  fireEvent.submit(
    screen.getByRole('button', { name: 'Send sign-in code' }).closest('form') as HTMLFormElement,
  );
  await screen.findByRole('alert');
  expect(screen.queryByRole('textbox', { name: 'Email code' })).toBeNull();
});

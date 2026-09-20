import { Text } from '@react-email/components';
import { EmailLayout } from './layout.js';

export const authCodeSubject = 'Your sign-in code';
export function AuthCodeEmail({ code }: { code: string }) {
  return (
    <EmailLayout preview="Your code to sign in." heading="Your sign-in code">
      <Text>Enter this code in the browser where you requested it:</Text>
      <Text style={{ fontSize: '32px', fontWeight: 'bold', letterSpacing: '6px' }}>{code}</Text>
      <Text>This code can only be used once. Never share it with anyone.</Text>
      <Text>If you did not request this code, you can ignore this email.</Text>
    </EmailLayout>
  );
}

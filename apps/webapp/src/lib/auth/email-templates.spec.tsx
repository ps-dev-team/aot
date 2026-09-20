import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthCodeEmail, AuthLinkEmail } from '@aot/email';
it('renders a numeric code with no authentication link', () => {
  const html = renderToStaticMarkup(AuthCodeEmail({ code: '123456' }));
  expect(html).toContain('123456');
  expect(html).not.toContain('<a ');
});
it('retains password confirmation links', () => {
  const html = renderToStaticMarkup(
    AuthLinkEmail({ kind: 'confirmation', actionUrl: 'https://app.test/callback?token_hash=test' }),
  );
  expect(html).toContain('token_hash=test');
});

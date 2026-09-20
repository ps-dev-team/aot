import { redirect } from 'next/navigation';

/** The root is a signpost, not a page: the guard decides where you actually land. */
export default function IndexPage() {
  redirect('/app');
}

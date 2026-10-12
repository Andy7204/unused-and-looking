import Hdr from '../src/components/Header';
import { banner, clean, dispatch } from '../src/title';

// TRAP: Next.js page default export + data fetching exports
export default function Home() {
  return <Hdr title={banner(clean('hi'))} />;
}

export async function getServerSideProps() {
  dispatch('save');
  return { props: {} };
}

import { Button } from './Button';
import makeTitle from '../title';

// TRAP: default export imported under another name ("Hdr") -> alive
export default function Header({ title }: { title: string }) {
  // Don't panic: an apostrophe in JSX text must not break parsing
  return (
    <header>
      <p>Don't worry, it's fine</p>
      <h1>{makeTitle(title)}</h1>
      <Button label="Hi" onClick={() => {}} />
    </header>
  );
}

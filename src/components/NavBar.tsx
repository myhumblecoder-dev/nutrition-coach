import Link from 'next/link';

export default function NavBar() {
  return (
    <nav className="flex gap-4 p-4 border-b">
      <Link href="/">Home</Link>
      <Link href="/targets">Targets</Link>
      <Link href="/chat">Chat</Link>
    </nav>
  );
}
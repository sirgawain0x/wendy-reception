export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Dr Fort Vercel</h1>
      <p>Static deployment with multiple HTML pages:</p>
      <ul>
        <li><a href="/src/index.html">index.html</a></li>
        <li><a href="/src/hub.html">hub.html</a></li>
        <li><a href="/src/live.html">live.html</a></li>
        <li><a href="/src/deck.html">deck.html</a></li>
        <li><a href="/src/deck.pdf">deck.pdf</a></li>
      </ul>
    </main>
  );
}

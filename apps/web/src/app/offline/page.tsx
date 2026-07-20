import Link from "next/link";

export const metadata = {
  title: "Offline · Glimpse Chat"
};

export default function OfflinePage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#f7f7f2", color: "#18312f" }}>
      <section style={{ width: "min(100%, 420px)", padding: 28, borderRadius: 24, background: "#ffffff", boxShadow: "0 20px 60px rgba(15, 118, 110, 0.12)", textAlign: "center" }}>
        <img src="/icons/icon-192.png" width="88" height="88" alt="Glimpse Chat" style={{ borderRadius: 22 }} />
        <h1 style={{ margin: "18px 0 8px", fontSize: 26 }}>You are offline</h1>
        <p style={{ margin: "0 0 20px", color: "#58706d", lineHeight: 1.6 }}>
          Glimpse Chat needs a network connection to load conversations and media safely.
        </p>
        <Link href="/" style={{ display: "inline-block", padding: "11px 18px", borderRadius: 999, background: "#0f766e", color: "#ffffff", textDecoration: "none", fontWeight: 700 }}>
          Try again
        </Link>
      </section>
    </main>
  );
}

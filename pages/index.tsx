import Dashboard from "../components/Dashboard";

export default function Home() {
  return (
    <>
      <Dashboard />
      <a
        href="/accounting"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 1000,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 18px",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 800,
          boxShadow: "0 8px 24px rgba(17,24,39,.2)",
        }}
      >
        📒 経理・帳簿
      </a>
    </>
  );
}

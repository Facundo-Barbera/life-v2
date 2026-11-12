export default function Page() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        gap: 12,
      }}
    >
      <p
        style={{
          color: "var(--life-muted)",
          fontSize: 14,
          fontWeight: 510,
          letterSpacing: "-0.01em",
        }}
      >
        Life
      </p>
      <h1
        style={{
          fontSize: 48,
          fontWeight: 620,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        Pulso
      </h1>
      <p
        style={{
          color: "var(--life-muted)",
          fontSize: 16,
          fontWeight: 430,
          letterSpacing: "-0.015em",
          maxWidth: 360,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        El rastro del cuerpo. La base y el login se están armando; aquí va a vivir
        el peso, la comida, el sueño y el entreno.
      </p>
    </main>
  );
}

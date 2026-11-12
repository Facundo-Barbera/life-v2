export function Avatars({ people, max = 4 }: { people: string[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="avs">
      {shown.map((p) => (
        <span key={p} className={`av av-${hue(p)}`} title={p}>
          {p[0]}
        </span>
      ))}
      {rest > 0 && <span className="av av-more">+{rest}</span>}
    </span>
  );
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

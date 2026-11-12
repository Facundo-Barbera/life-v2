export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="ui-switch-row" onClick={() => onChange(!checked)}>
      <span className={`ui-switch ${checked ? "on" : ""}`}>
        <span className="ui-switch-knob" />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

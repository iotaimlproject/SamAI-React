export function Toggle({ on, onChange }) {
  return (
    <button
      className="switch"
      data-on={on}
      onClick={() => onChange(!on)}
      aria-label="toggle"
    />
  );
}

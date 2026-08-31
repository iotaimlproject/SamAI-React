export function Led({ label, on }) {
  return (
    <div className="led-block">
      <div className="led" data-on={on} />
      <span className="led-label">{label}</span>
    </div>
  );
}

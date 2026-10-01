export default function MonthNav({ title, onPrev, onNext }) {
  return (
    <div className="month-nav">
      <button type="button" onClick={onPrev} aria-label="Previous month">
        ‹
      </button>
      <h1 className="month-title">{title}</h1>
      <button type="button" onClick={onNext} aria-label="Next month">
        ›
      </button>
    </div>
  );
}

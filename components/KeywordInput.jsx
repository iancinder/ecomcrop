"use client";

// Single keyword field that drives SEO filenames at export time (step 3 spec).
export default function KeywordInput({ value, onChange }) {
  return (
    <div className="keyword">
      <label className="keyword__label" htmlFor="product-keyword">
        Product keyword
      </label>
      <input
        id="product-keyword"
        type="text"
        className="keyword__input"
        placeholder="e.g. handmade leather wallet"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="keyword__hint">
        Used to name exported files. Leave blank to fall back to “product”.
      </p>
    </div>
  );
}

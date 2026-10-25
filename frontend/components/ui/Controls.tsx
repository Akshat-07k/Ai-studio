'use client';

import type { ReactNode } from 'react';

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
      <div className="slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="num"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
  format = (v) => v,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  format?: (value: string) => string;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {format(o)}
        </option>
      ))}
    </select>
  );
}

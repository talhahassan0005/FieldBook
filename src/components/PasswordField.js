"use client";

import { useState } from "react";

function EyeIcon({ open }) {
  return open ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
      <path d="M9.88 5.08A10.94 10.94 0 0 1 12 4.5C18.5 4.5 22 12 22 12a18.76 18.76 0 0 1-4.15 5.18" />
      <path d="M6.11 6.11C3.72 8.05 2 12 2 12s3.5 7.5 10 7.5a11.3 11.3 0 0 0 4.29-.87" />
    </svg>
  );
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required = false,
  helperText,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="input pr-11"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {helperText ? <p className="mt-1 text-xs text-slate-400">{helperText}</p> : null}
    </div>
  );
}
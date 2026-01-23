"use client";

interface ToggleProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function Toggle({ options, value, onChange }: ToggleProps) {
  return (
    <div className="glass-toggle inline-flex p-1 gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
            value === option.value
              ? "glass-toggle-active text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

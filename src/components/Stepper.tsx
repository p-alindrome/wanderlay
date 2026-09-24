import { useRouteStore } from '../store/RouteStore';

const STEPS: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'Create Route' },
  { id: 2, label: 'Route Editor' },
  { id: 3, label: 'Overlay Designer' },
];

export default function Stepper() {
  const { step, setStep } = useRouteStore();
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10 bg-[#0e0f14]">
      <div className="font-montserrat text-sm tracking-[3px] text-white/70 mr-6">WANDERLAY</div>
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <button
            onClick={() => setStep(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition ${
              step === s.id
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs border border-current">
              {s.id}
            </span>
            {s.label}
          </button>
          {i < STEPS.length - 1 && <span className="text-white/20">→</span>}
        </div>
      ))}
    </div>
  );
}

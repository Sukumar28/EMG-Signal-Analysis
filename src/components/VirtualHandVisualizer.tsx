import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

interface VirtualHandVisualizerProps {
  movement: string;
  confidence?: number;
  unreliable?: boolean;
}

type CanonicalMovement = 'hand_open' | 'hand_close' | 'wrist_flexion' | 'wrist_extension' | 'custom';

function normalizeMovement(label: string): CanonicalMovement {
  const s = label.toLowerCase().replace(/[_-]/g, ' ').trim();
  if (s.includes('hand open') || s === 'open' || s.includes('spread')) return 'hand_open';
  if (s.includes('hand close') || s.includes('fist') || s.includes('grip') || s === 'close') return 'hand_close';
  if (s.includes('wrist flex') || s.includes('flexion')) return 'wrist_flexion';
  if (s.includes('wrist ext') || s.includes('extension')) return 'wrist_extension';
  return 'custom';
}

const BIOMECHANICS_INFO: Record<
  CanonicalMovement,
  {
    primaryMuscle: string;
    kinematics: string;
    jointRange: string;
  }
> = {
  hand_open: {
    primaryMuscle: 'Extensor Digitorum & Abductor Pollicis Longus',
    kinematics: 'Full phalangeal extension and metacarpophalangeal abduction',
    jointRange: 'MCP / PIP Extension: 0° · Finger Splay: +18°',
  },
  hand_close: {
    primaryMuscle: 'Flexor Digitorum Superficialis & Profundus',
    kinematics: 'Concentric cylindrical power-grip finger flexion across MCP/PIP/DIP',
    jointRange: 'MCP Flexion: 82° · PIP Flexion: 95°',
  },
  wrist_flexion: {
    primaryMuscle: 'Flexor Carpi Radialis & Flexor Carpi Ulnaris',
    kinematics: 'Palmar (volar) rotation of radiocarpal & midcarpal joints',
    jointRange: 'Radiocarpal Palmar Flexion: +52°',
  },
  wrist_extension: {
    primaryMuscle: 'Extensor Carpi Radialis Longus/Brevis & Ulnaris',
    kinematics: 'Dorsal elevation of the hand relative to forearm axis',
    jointRange: 'Radiocarpal Dorsiflexion: -54°',
  },
  custom: {
    primaryMuscle: 'Forearm Flexor / Extensor Motor Unit Recruitment',
    kinematics: 'Custom trained neuromuscular activation pattern',
    jointRange: 'Evaluated via supervised time-domain EMG feature model',
  },
};

export default function VirtualHandVisualizer({
  movement,
  confidence,
  unreliable = false,
}: VirtualHandVisualizerProps) {
  const canonical = normalizeMovement(movement);
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState(0); // 0 -> 1 smooth kinematic cycle

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) {
      setPlaying(false);
      setPhase(1);
      return;
    }

    if (!playing) return;
    let rafId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsedSec = (now - start) / 1000;
      // Smooth physiological contraction-hold-relaxation cycle (2.8 s period)
      const wave = 0.5 - 0.5 * Math.cos((elapsedSec * Math.PI * 2) / 2.8);
      setPhase(wave);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, movement]);

  const info = BIOMECHANICS_INFO[canonical];

  const renderPalmHandSvg = (isClosing: boolean) => {
    // Interpolate finger lengths & splay angles for Hand Open vs Hand Close
    const t = phase; // 0 = neutral, 1 = target peak contraction
    const curl = isClosing ? t : 0;
    const splay = isClosing ? -0.35 * t : 1.0 * t;

    const fingerScaleY = isClosing ? 1 - 0.56 * curl : 1 + 0.06 * t;
    const fingerTipOffsetY = isClosing ? 24 * curl : -4 * t;
    const thumbRot = isClosing ? -44 + 46 * curl : -38 - 18 * t;

    const fingers = [
      { name: 'index', x: 112, baseY: 132, len: 74, baseAngle: -6 + splay * -12 },
      { name: 'middle', x: 142, baseY: 124, len: 84, baseAngle: -1 + splay * -3 },
      { name: 'ring', x: 172, baseY: 130, len: 76, baseAngle: 4 + splay * 7 },
      { name: 'pinky', x: 199, baseY: 144, len: 58, baseAngle: 10 + splay * 16 },
    ];

    const accentStroke = unreliable ? '#d97706' : '#0d9488';
    const accentFill = unreliable ? 'rgba(217, 119, 6, 0.14)' : 'rgba(13, 148, 136, 0.15)';

    return (
      <svg viewBox="0 0 300 290" className="h-64 w-full select-none" role="img" aria-label={`Virtual hand animation showing ${movement}`}>
        <defs>
          <linearGradient id="handFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <radialGradient id="muscleGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accentStroke} stopOpacity={0.28 + 0.25 * t} />
            <stop offset="100%" stopColor={accentStroke} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Calibration grid */}
        <g stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="3 3">
          <line x1="30" y1="60" x2="270" y2="60" />
          <line x1="30" y1="145" x2="270" y2="145" />
          <line x1="30" y1="230" x2="270" y2="230" />
          <line x1="150" y1="24" x2="150" y2="270" />
        </g>

        {/* Forearm base */}
        <path
          d="M 116 286 L 122 224 L 188 224 L 194 286 Z"
          fill="url(#handFill)"
          stroke="#0f2544"
          strokeWidth="2"
        />
        {/* Active muscle sensor band on wrist/forearm */}
        <rect
          x="121"
          y="236"
          width="68"
          height="16"
          rx="4"
          fill="#0f2544"
          opacity="0.92"
        />
        <circle cx="138" cy="244" r="3" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />
        <circle cx="155" cy="244" r="3" fill="#2dd4bf" opacity={0.55 + 0.45 * t} />
        <circle cx="172" cy="244" r="3" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />

        {/* Neuromuscular activation halo */}
        <circle cx="155" cy={isClosing ? 174 : 138} r={42 + 12 * t} fill="url(#muscleGlow)" />

        {/* Thumb */}
        <g transform={`translate(105, 198) rotate(${thumbRot})`}>
          <rect
            x="-13"
            y="-58"
            width="24"
            height="62"
            rx="12"
            fill="url(#handFill)"
            stroke="#0f2544"
            strokeWidth="2"
          />
          <circle cx="-1" cy="-28" r="3.5" fill={accentStroke} />
        </g>

        {/* Four fingers */}
        {fingers.map((f) => {
          const effLen = f.len * fingerScaleY;
          return (
            <g key={f.name} transform={`translate(${f.x}, ${f.baseY}) rotate(${f.baseAngle})`}>
              <rect
                x="-11"
                y={-effLen + fingerTipOffsetY}
                width="22"
                height={effLen + 14}
                rx="11"
                fill="url(#handFill)"
                stroke="#0f2544"
                strokeWidth="2"
              />
              {/* Knuckle / PIP joint lines */}
              <line
                x1="-7"
                y1={-effLen * 0.52 + fingerTipOffsetY}
                x2="7"
                y2={-effLen * 0.52 + fingerTipOffsetY}
                stroke={accentStroke}
                strokeWidth="1.6"
                opacity="0.8"
              />
              <circle cx="0" cy={0} r="3.5" fill={accentStroke} />
            </g>
          );
        })}

        {/* Palm contour */}
        <path
          d="M 102 142 C 98 128, 212 128, 210 148 L 204 202 C 201 218, 192 226, 178 228 L 130 228 C 114 226, 102 214, 100 196 Z"
          fill="url(#handFill)"
          stroke="#0f2544"
          strokeWidth="2.2"
        />

        {/* Palm flexion crease / grip indicator */}
        <path
          d={isClosing ? 'M 116 168 Q 155 182 194 166' : 'M 116 168 Q 155 162 194 168'}
          fill="none"
          stroke={accentStroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Kinematic motion arrows */}
        {!isClosing ? (
          <g stroke={accentStroke} strokeWidth="1.8" fill="none" opacity={0.4 + 0.6 * t}>
            <path d="M 88 74 L 74 58 M 74 58 L 83 58 M 74 58 L 74 67" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 222 78 L 238 62 M 238 62 L 229 62 M 238 62 L 238 71" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 142 32 L 142 16 M 142 16 L 136 22 M 142 16 L 148 22" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : (
          <g stroke={accentStroke} strokeWidth="1.8" fill={accentFill} opacity={0.45 + 0.55 * t}>
            <circle cx="155" cy="148" r={20 - 4 * t} strokeDasharray="4 3" />
            <path d="M 155 88 L 155 106 M 155 106 L 149 100 M 155 106 L 161 100" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
    );
  };

  const renderWristSagittalSvg = (isFlexion: boolean) => {
    // Sagittal forearm + wrist articulation: Flexion bends downward (+angle), Extension bends upward (-angle)
    const t = phase;
    const wristAngle = isFlexion ? 52 * t : -54 * t;
    const accentStroke = unreliable ? '#d97706' : '#0891b2';

    return (
      <svg viewBox="0 0 320 260" className="h-64 w-full select-none" role="img" aria-label={`Virtual wrist animation showing ${movement}`}>
        <defs>
          <linearGradient id="forearmGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>

        {/* Reference neutral axis */}
        <line x1="24" y1="132" x2="296" y2="132" stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="4 4" />
        <text x="274" y="125" fontSize="9.5" fill="#94a3b8" fontFamily="IBM Plex Mono, monospace">
          0°
        </text>

        {/* Angle arc indicator */}
        <path
          d={isFlexion ? 'M 218 132 A 54 54 0 0 1 200 176' : 'M 218 132 A 54 54 0 0 0 200 88'}
          fill="none"
          stroke={accentStroke}
          strokeWidth="2"
          strokeDasharray="3 3"
          opacity={0.45 + 0.55 * t}
        />
        <text
          x="212"
          y={isFlexion ? 186 : 82}
          fontSize="10.5"
          fontWeight="600"
          fill={accentStroke}
          fontFamily="IBM Plex Mono, monospace"
        >
          {isFlexion ? `+${Math.round(52 * t)}°` : `-${Math.round(54 * t)}°`}
        </text>

        {/* Stationary Forearm */}
        <path
          d="M 28 106 L 160 114 C 170 115, 174 122, 174 132 C 174 142, 170 149, 160 150 L 28 158 Z"
          fill="url(#forearmGrad)"
          stroke="#0f2544"
          strokeWidth="2.2"
        />

        {/* Active muscle belly highlight (ventral/palmar for Flexion, dorsal for Extension) */}
        <ellipse
          cx="96"
          cy={isFlexion ? 148 : 114}
          rx={38}
          ry={9 + 3 * t}
          fill={accentStroke}
          opacity={0.18 + 0.25 * t}
        />

        {/* Surface EMG electrode sensor patch on forearm */}
        <rect
          x="74"
          y={isFlexion ? 146 : 103}
          width="44"
          height="11"
          rx="3"
          fill="#0f2544"
        />
        <circle cx="88" cy={isFlexion ? 151.5 : 108.5} r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />
        <circle cx="104" cy={isFlexion ? 151.5 : 108.5} r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />

        {/* Articulated Hand & Fingers pivoting at radiocarpal joint (164, 132) */}
        <g transform={`translate(164, 132) rotate(${wristAngle})`}>
          {/* Metacarpals / palm side profile */}
          <path
            d="M -4 -16 L 56 -14 C 66 -13, 72 -6, 72 0 C 72 8, 66 15, 56 16 L -4 17 Z"
            fill="url(#forearmGrad)"
            stroke="#0f2544"
            strokeWidth="2.2"
          />
          {/* Extended phalanges */}
          <rect
            x="54"
            y="-10"
            width="62"
            height="19"
            rx="9.5"
            fill="url(#forearmGrad)"
            stroke="#0f2544"
            strokeWidth="2"
          />
          {/* Thumb profile */}
          <path
            d="M 20 12 L 48 26 C 54 29, 60 26, 61 21 C 62 16, 57 12, 48 9 L 26 6 Z"
            fill="url(#forearmGrad)"
            stroke="#0f2544"
            strokeWidth="1.8"
          />
          {/* Joint markers */}
          <circle cx="58" cy="0" r="3" fill={accentStroke} />
        </g>

        {/* Radiocarpal pivot joint */}
        <circle cx="164" cy="132" r="7" fill="#ffffff" stroke={accentStroke} strokeWidth="2.5" />
        <circle cx="164" cy="132" r="2.5" fill="#0f2544" />

        {/* Anatomical labels */}
        <text x="32" y="96" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          Dorsal (Extensor)
        </text>
        <text x="32" y="176" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          Palmar / Volar (Flexor)
        </text>
      </svg>
    );
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Virtual Biomechanical Hand Model</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Kinematic rendering synchronized to predicted sEMG class
          </p>
        </div>
        {canonical !== 'custom' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => setPhase(1)}
              title="Hold peak contraction pose"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="my-3 flex items-center justify-center rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
        {canonical === 'hand_open' && renderPalmHandSvg(false)}
        {canonical === 'hand_close' && renderPalmHandSvg(true)}
        {canonical === 'wrist_flexion' && renderWristSagittalSvg(true)}
        {canonical === 'wrist_extension' && renderWristSagittalSvg(false)}
        {canonical === 'custom' && (
          <div className="flex h-56 flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-medium text-slate-500">Predicted Custom Movement Class</p>
            <p className="mt-2 font-display text-2xl font-bold text-[#0F2544]">{movement}</p>
            {confidence !== undefined && (
              <p className="mt-1 font-mono text-sm text-teal-700">
                Confidence: {confidence.toFixed(1)}%
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-500 shrink-0">Active Muscle Group</span>
          <span className="text-right font-medium text-slate-800">{info.primaryMuscle}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-500 shrink-0">Kinematics</span>
          <span className="text-right text-slate-700">{info.kinematics}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-500 shrink-0">Reference Range</span>
          <span className="text-right font-mono text-slate-700">{info.jointRange}</span>
        </div>
      </div>
    </div>
  );
}

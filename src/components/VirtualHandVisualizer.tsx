import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

interface VirtualHandVisualizerProps {
  movement: string;
  confidence?: number;
  unreliable?: boolean;
}

type CanonicalAction =
  | 'rest'
  | 'hand_open'
  | 'hand_close'
  | 'pinch_grip'
  | 'pointing_index'
  | 'wrist_flexion'
  | 'wrist_extension'
  | 'wrist_pronation'
  | 'wrist_supination'
  | 'radial_deviation'
  | 'ulnar_deviation'
  | 'elbow_flexion'
  | 'custom';

function normalizeAction(label: string): CanonicalAction {
  const s = label.toLowerCase().replace(/[_-]/g, ' ').trim();
  if (s.includes('rest') || s.includes('baseline') || s.includes('neutral')) return 'rest';
  if (s.includes('hand open') || s === 'open' || s.includes('spread')) return 'hand_open';
  if (s.includes('hand close') || s.includes('fist') || s.includes('power grip') || s === 'close') return 'hand_close';
  if (s.includes('pinch')) return 'pinch_grip';
  if (s.includes('point') || s.includes('index')) return 'pointing_index';
  if (s.includes('wrist flex') || (s.includes('flexion') && !s.includes('elbow'))) return 'wrist_flexion';
  if (s.includes('wrist ext') || s.includes('extension')) return 'wrist_extension';
  if (s.includes('pronat')) return 'wrist_pronation';
  if (s.includes('supinat')) return 'wrist_supination';
  if (s.includes('radial')) return 'radial_deviation';
  if (s.includes('ulnar')) return 'ulnar_deviation';
  if (s.includes('elbow') || s.includes('bicep')) return 'elbow_flexion';
  return 'custom';
}

const BIOMECHANICS_INFO: Record<
  CanonicalAction,
  {
    primaryMuscle: string;
    kinematics: string;
    jointRange: string;
    electrodeSite: string;
  }
> = {
  rest: {
    primaryMuscle: 'Tonic Baseline (Relaxed Upper Limb)',
    kinematics: 'Neutral resting posture with zero voluntary isometric contraction',
    jointRange: 'All Joints: 0° Neutral · Baseline Noise Floor',
    electrodeSite: 'All 4 Channels (Baseline Quiet)',
  },
  hand_open: {
    primaryMuscle: 'Extensor Digitorum & Abductor Pollicis Longus',
    kinematics: 'Full 5-digit phalangeal extension and metacarpophalangeal splay',
    jointRange: 'MCP / PIP Extension: 0° · Finger Splay: +18°',
    electrodeSite: 'Ch2 Forearm Extensor (Dorsal)',
  },
  hand_close: {
    primaryMuscle: 'Flexor Digitorum Superficialis & Profundus',
    kinematics: 'Concentric cylindrical power-grip flexion across MCP/PIP/DIP',
    jointRange: 'MCP Flexion: 82° · PIP Flexion: 95°',
    electrodeSite: 'Ch1 Forearm Flexor (Palmar)',
  },
  pinch_grip: {
    primaryMuscle: 'Flexor Pollicis Longus & First Dorsal Interosseous',
    kinematics: 'Thumb-to-index precision opposition with digits 3–5 stabilized',
    jointRange: 'Thumb Opposition: 55° · Index PIP: 48°',
    electrodeSite: 'Ch1 Flexor + Ch3 Intrinsic/Radial',
  },
  pointing_index: {
    primaryMuscle: 'Extensor Indicis & Selective Flexor Digitorum',
    kinematics: 'Isolated index finger extension while digits 3–5 flex into palm',
    jointRange: 'Index MCP: 0° · Digits 3–5 Flexion: 88°',
    electrodeSite: 'Ch2 Extensor + Ch1 Flexor Co-Activation',
  },
  wrist_flexion: {
    primaryMuscle: 'Flexor Carpi Radialis & Flexor Carpi Ulnaris',
    kinematics: 'Palmar (volar) rotation of radiocarpal & midcarpal joints',
    jointRange: 'Radiocarpal Palmar Flexion: +52°',
    electrodeSite: 'Ch1 Forearm Flexor + Ch3 Ulnar Flexor',
  },
  wrist_extension: {
    primaryMuscle: 'Extensor Carpi Radialis Longus/Brevis & Ulnaris',
    kinematics: 'Dorsal elevation of the hand relative to forearm axis',
    jointRange: 'Radiocarpal Dorsiflexion: -54°',
    electrodeSite: 'Ch2 Forearm Extensor (Dorsal)',
  },
  wrist_pronation: {
    primaryMuscle: 'Pronator Teres & Pronator Quadratus',
    kinematics: 'Internal axial rotation of radius over ulna turning palm downward',
    jointRange: 'Radioulnar Pronation: +80°',
    electrodeSite: 'Ch3 Proximal Pronator Teres',
  },
  wrist_supination: {
    primaryMuscle: 'Supinator & Biceps Brachii',
    kinematics: 'External axial forearm rotation aligning radius parallel to ulna',
    jointRange: 'Radioulnar Supination: -85°',
    electrodeSite: 'Ch3 Supinator + Ch4 Biceps Synergy',
  },
  radial_deviation: {
    primaryMuscle: 'Flexor Carpi Radialis & Extensor Carpi Radialis Longus',
    kinematics: 'Lateral wrist abduction pivoting hand toward radial (thumb) side',
    jointRange: 'Radial Abduction: +22°',
    electrodeSite: 'Ch1 + Ch2 + Ch3 Radial Co-Activation',
  },
  ulnar_deviation: {
    primaryMuscle: 'Flexor Carpi Ulnaris & Extensor Carpi Ulnaris',
    kinematics: 'Medial wrist adduction pivoting hand toward ulnar (pinky) side',
    jointRange: 'Ulnar Adduction: -34°',
    electrodeSite: 'Ch3 Ulnar Stabilizer Dominant',
  },
  elbow_flexion: {
    primaryMuscle: 'Biceps Brachii, Brachialis & Brachioradialis',
    kinematics: 'Concentric humero-ulnar flexion elevating forearm toward shoulder',
    jointRange: 'Elbow Joint Flexion: 15° → 118°',
    electrodeSite: 'Ch4 Upper Arm Biceps Belly',
  },
  custom: {
    primaryMuscle: 'Custom Trained Neuromuscular Activation',
    kinematics: 'Decoded via multi-window time-domain EMG feature classifier',
    jointRange: 'Supervised sEMG Pattern Recognition',
    electrodeSite: 'Active Selected EMG Channel(s)',
  },
};

export default function VirtualHandVisualizer({
  movement,
  confidence,
  unreliable = false,
}: VirtualHandVisualizerProps) {
  const canonical = normalizeAction(movement);
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState(0);

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
      const wave = 0.5 - 0.5 * Math.cos((elapsedSec * Math.PI * 2) / 2.8);
      setPhase(wave);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, movement]);

  const info = BIOMECHANICS_INFO[canonical];
  const accentStroke = unreliable ? '#d97706' : '#0d9488';
  const accentCyan = unreliable ? '#d97706' : '#0891b2';

  // 1. Hand / Finger Actions (Rest, Hand Open, Hand Close, Pinch Grip, Pointing Index, Radial/Ulnar Deviation)
  const renderHandView = (
    mode: 'rest' | 'hand_open' | 'hand_close' | 'pinch_grip' | 'pointing_index' | 'radial_deviation' | 'ulnar_deviation'
  ) => {
    const t = phase;
    let wristPivotAngle = 0;
    if (mode === 'radial_deviation') wristPivotAngle = -24 * t;
    if (mode === 'ulnar_deviation') wristPivotAngle = 32 * t;

    // Per-finger curl ratios (0 = straight, 1 = curled into palm) & splay offsets
    const fingerSpecs = [
      { name: 'index', x: 112, baseY: 132, len: 74, restAngle: -5 },
      { name: 'middle', x: 142, baseY: 124, len: 84, restAngle: -1 },
      { name: 'ring', x: 172, baseY: 130, len: 76, restAngle: 4 },
      { name: 'pinky', x: 199, baseY: 144, len: 58, restAngle: 9 },
    ].map((f, idx) => {
      let curl = 0;
      let splay = 0;
      if (mode === 'rest') {
        curl = 0.14 + 0.03 * t;
      } else if (mode === 'hand_open') {
        curl = 0;
        splay = (idx - 1.5) * 9 * t;
      } else if (mode === 'hand_close') {
        curl = 0.92 * t;
        splay = (idx - 1.5) * -2.5 * t;
      } else if (mode === 'pinch_grip') {
        if (idx === 0) {
          curl = 0.42 * t;
          splay = -16 * t; // Index tilts inward toward thumb tip
        } else {
          curl = 0.65 * t;
        }
      } else if (mode === 'pointing_index') {
        if (idx === 0) {
          curl = 0;
          splay = -4 * t;
        } else {
          curl = 0.92 * t;
        }
      } else {
        curl = 0.12;
      }
      return { ...f, curl, angle: f.restAngle + splay };
    });

    let thumbRot = -36;
    if (mode === 'rest') thumbRot = -34 - 2 * t;
    if (mode === 'hand_open') thumbRot = -38 - 18 * t;
    if (mode === 'hand_close') thumbRot = -38 + 46 * t;
    if (mode === 'pinch_grip') thumbRot = -34 + 28 * t;
    if (mode === 'pointing_index') thumbRot = -36 + 44 * t;

    const ledOpacity = mode === 'rest' ? 0.35 : 0.45 + 0.55 * t;

    return (
      <svg viewBox="0 0 300 290" className="h-64 w-full select-none" role="img" aria-label={`Virtual hand animation showing ${movement}`}>
        <defs>
          <linearGradient id="handFillV2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <radialGradient id="muscleGlowV2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accentStroke} stopOpacity={mode === 'rest' ? 0.08 : 0.26 + 0.24 * t} />
            <stop offset="100%" stopColor={accentStroke} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Calibration grid */}
        <g stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="3 3">
          <line x1="28" y1="60" x2="272" y2="60" />
          <line x1="28" y1="145" x2="272" y2="145" />
          <line x1="28" y1="226" x2="272" y2="226" />
          <line x1="155" y1="22" x2="155" y2="272" />
        </g>

        {/* Stationary Forearm */}
        <path
          d="M 118 286 L 124 224 L 186 224 L 192 286 Z"
          fill="url(#handFillV2)"
          stroke="#0f2544"
          strokeWidth="2"
        />
        {/* Sensor band */}
        <rect x="122" y="236" width="66" height="16" rx="4" fill="#0f2544" opacity="0.94" />
        <circle cx="138" cy="244" r="2.8" fill="#2dd4bf" opacity={ledOpacity} />
        <circle cx="155" cy="244" r="2.8" fill="#2dd4bf" opacity={ledOpacity} />
        <circle cx="172" cy="244" r="2.8" fill="#2dd4bf" opacity={ledOpacity} />

        {/* Articulated Hand Group pivoting at wrist center (155, 224) */}
        <g transform={`translate(155, 224) rotate(${wristPivotAngle}) translate(-155, -224)`}>
          <circle cx="155" cy="166" r={40 + 10 * t} fill="url(#muscleGlowV2)" />

          {/* Thumb */}
          <g transform={`translate(105, 198) rotate(${thumbRot})`}>
            <rect
              x="-12"
              y="-58"
              width="23"
              height="62"
              rx="11.5"
              fill="url(#handFillV2)"
              stroke="#0f2544"
              strokeWidth="2"
            />
            <circle cx="-0.5" cy="-28" r="3.2" fill={mode === 'pinch_grip' ? accentCyan : accentStroke} />
          </g>

          {/* 4 Fingers */}
          {fingerSpecs.map((f) => {
            const effLen = f.len * (1 - 0.56 * f.curl);
            const tipOffset = 22 * f.curl;
            const highlightDigit =
              (mode === 'pointing_index' && f.name === 'index') ||
              (mode === 'pinch_grip' && f.name === 'index');
            return (
              <g key={f.name} transform={`translate(${f.x}, ${f.baseY}) rotate(${f.angle})`}>
                <rect
                  x="-10.5"
                  y={-effLen + tipOffset}
                  width="21"
                  height={effLen + 14}
                  rx="10.5"
                  fill="url(#handFillV2)"
                  stroke={highlightDigit ? accentCyan : '#0f2544'}
                  strokeWidth={highlightDigit ? '2.4' : '2'}
                />
                <line
                  x1="-6.5"
                  y1={-effLen * 0.52 + tipOffset}
                  x2="6.5"
                  y2={-effLen * 0.52 + tipOffset}
                  stroke={accentStroke}
                  strokeWidth="1.5"
                  opacity="0.75"
                />
                <circle cx="0" cy={0} r="3.2" fill={accentStroke} />
              </g>
            );
          })}

          {/* Palm */}
          <path
            d="M 102 142 C 98 128, 212 128, 210 148 L 204 202 C 201 218, 192 226, 178 228 L 130 228 C 114 226, 102 214, 100 196 Z"
            fill="url(#handFillV2)"
            stroke="#0f2544"
            strokeWidth="2.2"
          />

          {/* Pinch Contact Indicator */}
          {mode === 'pinch_grip' && (
            <g opacity={0.35 + 0.65 * t}>
              <circle cx="96" cy="118" r={10 - 3 * t} fill="none" stroke={accentCyan} strokeWidth="2" strokeDasharray="3 2" />
              <circle cx="96" cy="118" r="3" fill={accentCyan} />
            </g>
          )}

          {/* Pointing Index Upward Arrow */}
          {mode === 'pointing_index' && (
            <path
              d="M 110 42 L 110 22 M 110 22 L 104 29 M 110 22 L 116 29"
              stroke={accentCyan}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45 + 0.55 * t}
            />
          )}

          {/* Hand Open Splay Arrows */}
          {mode === 'hand_open' && (
            <g stroke={accentStroke} strokeWidth="1.8" fill="none" opacity={0.4 + 0.6 * t}>
              <path d="M 86 76 L 72 60 M 72 60 L 81 60 M 72 60 L 72 69" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 224 80 L 240 64 M 240 64 L 231 64 M 240 64 L 240 73" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
        </g>

        {/* Radial / Ulnar Deviation Angle Arc */}
        {(mode === 'radial_deviation' || mode === 'ulnar_deviation') && (
          <g>
            <circle cx="155" cy="224" r="5" fill="#ffffff" stroke={accentCyan} strokeWidth="2" />
            <text
              x={mode === 'radial_deviation' ? '42' : '222'}
              y="46"
              fontSize="11"
              fontWeight="600"
              fill={accentCyan}
              fontFamily="IBM Plex Mono, monospace"
            >
              {mode === 'radial_deviation' ? `+${Math.round(22 * t)}° RAD` : `-${Math.round(34 * t)}° ULN`}
            </text>
          </g>
        )}

        {mode === 'rest' && (
          <text x="155" y="34" textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="IBM Plex Mono, monospace">
            RESTING BASELINE · ZERO CONTRACTION
          </text>
        )}
      </svg>
    );
  };

  // 2. Sagittal Wrist Flexion & Extension
  const renderWristSagittalSvg = (isFlexion: boolean) => {
    const t = phase;
    const wristAngle = isFlexion ? 52 * t : -54 * t;

    return (
      <svg viewBox="0 0 320 260" className="h-64 w-full select-none" role="img" aria-label={`Virtual wrist animation showing ${movement}`}>
        <defs>
          <linearGradient id="forearmGradV2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>

        <line x1="24" y1="132" x2="296" y2="132" stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="4 4" />
        <text x="274" y="125" fontSize="9.5" fill="#94a3b8" fontFamily="IBM Plex Mono, monospace">
          0°
        </text>

        <path
          d={isFlexion ? 'M 218 132 A 54 54 0 0 1 200 176' : 'M 218 132 A 54 54 0 0 0 200 88'}
          fill="none"
          stroke={accentCyan}
          strokeWidth="2"
          strokeDasharray="3 3"
          opacity={0.45 + 0.55 * t}
        />
        <text
          x="212"
          y={isFlexion ? 186 : 82}
          fontSize="10.5"
          fontWeight="600"
          fill={accentCyan}
          fontFamily="IBM Plex Mono, monospace"
        >
          {isFlexion ? `+${Math.round(52 * t)}°` : `-${Math.round(54 * t)}°`}
        </text>

        <path
          d="M 28 106 L 160 114 C 170 115, 174 122, 174 132 C 174 142, 170 149, 160 150 L 28 158 Z"
          fill="url(#forearmGradV2)"
          stroke="#0f2544"
          strokeWidth="2.2"
        />

        <ellipse cx="96" cy={isFlexion ? 148 : 114} rx={38} ry={9 + 3 * t} fill={accentCyan} opacity={0.18 + 0.25 * t} />
        <rect x="74" y={isFlexion ? 146 : 103} width="44" height="11" rx="3" fill="#0f2544" />
        <circle cx="88" cy={isFlexion ? 151.5 : 108.5} r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />
        <circle cx="104" cy={isFlexion ? 151.5 : 108.5} r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />

        <g transform={`translate(164, 132) rotate(${wristAngle})`}>
          <path
            d="M -4 -16 L 56 -14 C 66 -13, 72 -6, 72 0 C 72 8, 66 15, 56 16 L -4 17 Z"
            fill="url(#forearmGradV2)"
            stroke="#0f2544"
            strokeWidth="2.2"
          />
          <rect x="54" y="-10" width="62" height="19" rx="9.5" fill="url(#forearmGradV2)" stroke="#0f2544" strokeWidth="2" />
          <path
            d="M 20 12 L 48 26 C 54 29, 60 26, 61 21 C 62 16, 57 12, 48 9 L 26 6 Z"
            fill="url(#forearmGradV2)"
            stroke="#0f2544"
            strokeWidth="1.8"
          />
        </g>

        <circle cx="164" cy="132" r="7" fill="#ffffff" stroke={accentCyan} strokeWidth="2.5" />
        <circle cx="164" cy="132" r="2.5" fill="#0f2544" />

        <text x="32" y="94" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          Dorsal (Extensor)
        </text>
        <text x="32" y="178" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          Palmar / Volar (Flexor)
        </text>
      </svg>
    );
  };

  // 3. Axial Forearm Pronation & Supination
  const renderForearmRotationSvg = (isPronation: boolean) => {
    const t = phase;
    const deg = Math.round((isPronation ? 80 : 85) * t);
    // Perspective squash of palm as forearm rotates axially around longitudinal axis
    const palmScaleY = Math.cos(t * Math.PI * 0.45);
    const radiusCross = isPronation ? t * 24 : -t * 8;

    return (
      <svg viewBox="0 0 320 260" className="h-64 w-full select-none" role="img" aria-label={`Virtual forearm rotation showing ${movement}`}>
        {/* Longitudinal rotational axis */}
        <line x1="20" y1="130" x2="300" y2="130" stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="4 4" />

        {/* Forearm shell */}
        <path
          d="M 32 98 L 176 108 L 176 152 L 32 162 Z"
          fill="#f1f5f9"
          stroke="#0f2544"
          strokeWidth="2.2"
        />

        {/* Ulna (stationary bone line) and Radius (rotating bone line) */}
        <line x1="42" y1="142" x2="170" y2="140" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
        <line
          x1="42"
          y1="118"
          x2="170"
          y2={118 + radiusCross}
          stroke={accentCyan}
          strokeWidth="4.2"
          strokeLinecap="round"
        />

        {/* Pronator/Supinator muscle highlight */}
        <ellipse cx="104" cy="130" rx="34" ry="13" fill={accentStroke} opacity={0.16 + 0.25 * t} />
        <rect x="82" y="123" width="44" height="14" rx="3" fill="#0f2544" />
        <circle cx="96" cy="130" r="2.4" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />
        <circle cx="112" cy="130" r="2.4" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />

        {/* Rotating Palm Plate */}
        <g transform={`translate(226, 130) scale(1, ${Math.max(0.28, Math.abs(palmScaleY))})`}>
          <rect
            x="-46"
            y="-34"
            width="86"
            height="68"
            rx="16"
            fill="#f8fafc"
            stroke="#0f2544"
            strokeWidth="2.4"
          />
          <line x1="-18" y1="-16" x2="28" y2="-16" stroke={accentStroke} strokeWidth="1.8" />
          <line x1="-18" y1="0" x2="32" y2="0" stroke={accentStroke} strokeWidth="1.8" />
          <line x1="-18" y1="16" x2="26" y2="16" stroke={accentStroke} strokeWidth="1.8" />
        </g>

        {/* Curved Axial Rotation Arrow */}
        <path
          d={
            isPronation
              ? 'M 218 64 A 46 66 0 0 1 258 188'
              : 'M 258 188 A 46 66 0 0 0 218 64'
          }
          fill="none"
          stroke={accentCyan}
          strokeWidth="2.2"
          strokeDasharray="4 3"
          opacity={0.45 + 0.55 * t}
        />
        <text x="194" y="48" fontSize="11" fontWeight="600" fill={accentCyan} fontFamily="IBM Plex Mono, monospace">
          {isPronation ? `PRONATION +${deg}°` : `SUPINATION -${deg}°`}
        </text>
        <text x="34" y="186" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          {isPronation ? 'Radius crosses over Ulna (Palm Down)' : 'Radius aligns parallel to Ulna (Palm Up)'}
        </text>
      </svg>
    );
  };

  // 4. Upper-Limb Elbow Flexion (Biceps Brachii Contraction)
  const renderElbowFlexionSvg = () => {
    const t = phase;
    const elbowFlexDeg = 15 + 103 * t; // 15° -> 118°
    const forearmRot = -elbowFlexDeg;
    const bicepsBulge = 12 + 12 * t;

    return (
      <svg viewBox="0 0 320 265" className="h-64 w-full select-none" role="img" aria-label="Virtual elbow flexion animation">
        {/* Coordinate reference */}
        <line x1="115" y1="40" x2="115" y2="235" stroke="#e2e8f0" strokeWidth="1.2" strokeDasharray="4 4" />
        <line x1="40" y1="192" x2="280" y2="192" stroke="#e2e8f0" strokeWidth="1.2" strokeDasharray="4 4" />

        {/* Shoulder joint */}
        <circle cx="115" cy="54" r="14" fill="#e2e8f0" stroke="#0f2544" strokeWidth="2.2" />

        {/* Upper Arm (Humerus) */}
        <path
          d="M 96 58 L 134 58 L 132 192 L 98 192 Z"
          fill="#f8fafc"
          stroke="#0f2544"
          strokeWidth="2.2"
        />

        {/* Animated Biceps Brachii Belly Bulge */}
        <ellipse
          cx={134 + bicepsBulge * 0.25}
          cy="124"
          rx={bicepsBulge}
          ry={34 - 5 * t}
          fill={accentStroke}
          opacity={0.22 + 0.35 * t}
          stroke={accentStroke}
          strokeWidth="1.5"
        />
        {/* Ch4 Biceps sEMG Sensor Patch */}
        <rect x="122" y="114" width="16" height="28" rx="3" fill="#0f2544" />
        <circle cx="130" cy="123" r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />
        <circle cx="130" cy="133" r="2.2" fill="#2dd4bf" opacity={0.45 + 0.55 * t} />

        {/* Articulated Forearm + Fist pivoting at Elbow (115, 192) */}
        <g transform={`translate(115, 192) rotate(${forearmRot})`}>
          <path
            d="M 0 -13 L 116 -10 L 116 10 L 0 13 Z"
            fill="#f1f5f9"
            stroke="#0f2544"
            strokeWidth="2.2"
          />
          <circle cx="126" cy="0" r="15" fill="#e2e8f0" stroke="#0f2544" strokeWidth="2.2" />
        </g>

        {/* Elbow Hinge Joint */}
        <circle cx="115" cy="192" r="9" fill="#ffffff" stroke={accentCyan} strokeWidth="2.5" />
        <circle cx="115" cy="192" r="3" fill="#0f2544" />

        <text x="172" y="72" fontSize="11" fontWeight="600" fill={accentCyan} fontFamily="IBM Plex Mono, monospace">
          ELBOW FLEXION: {Math.round(elbowFlexDeg)}°
        </text>
        <text x="172" y="88" fontSize="10" fill="#64748b" fontFamily="DM Sans, sans-serif">
          Biceps Brachii Concentric Contraction
        </text>
      </svg>
    );
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Virtual Biomechanical Limb Model</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Anatomical kinematic animation synchronized to predicted sEMG action
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
        {(canonical === 'rest' ||
          canonical === 'hand_open' ||
          canonical === 'hand_close' ||
          canonical === 'pinch_grip' ||
          canonical === 'pointing_index' ||
          canonical === 'radial_deviation' ||
          canonical === 'ulnar_deviation') &&
          renderHandView(canonical)}
        {canonical === 'wrist_flexion' && renderWristSagittalSvg(true)}
        {canonical === 'wrist_extension' && renderWristSagittalSvg(false)}
        {canonical === 'wrist_pronation' && renderForearmRotationSvg(true)}
        {canonical === 'wrist_supination' && renderForearmRotationSvg(false)}
        {canonical === 'elbow_flexion' && renderElbowFlexionSvg()}
        {canonical === 'custom' && (
          <div className="flex h-56 flex-col items-center justify-center px-4 text-center">
            <p className="text-xs font-medium text-slate-500">Predicted Custom Muscle Action</p>
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
          <span className="shrink-0 text-slate-500">Active Muscle Group</span>
          <span className="text-right font-medium text-slate-800">{info.primaryMuscle}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-slate-500">Kinematics</span>
          <span className="text-right text-slate-700">{info.kinematics}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-slate-500">Electrode Site</span>
          <span className="text-right font-mono text-slate-700">{info.electrodeSite}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-slate-500">Reference Range</span>
          <span className="text-right font-mono text-slate-700">{info.jointRange}</span>
        </div>
      </div>
    </div>
  );
}

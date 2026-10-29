"use client"
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  ArrowLeftRight,
  Box,
  Cpu,
  Layers,
  Eye,
  Compass,
  Sliders,
  BookOpen,
  Award,
  Code,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
  Maximize2,
  ChevronRight,
  StepForward,
  Info,
  ShieldCheck,
  Terminal,
  Activity,
  Sparkles,
  Focus
} from 'lucide-react';

// ============================================================================
// 0. LIGHTWEIGHT ZERO-DEPENDENCY TWEEN ENGINE (GSAP-COMPATIBLE API)
// ============================================================================

type TweenOptions = {
  duration?: number;
  ease?: 'power2.out' | 'power3.out' | 'power3.inOut' | string;
  onUpdate?: () => void;
  [key: string]: any;
};

const activeTweens = new Map<object, number>();

const gsap = {
  to: (target: Record<string, any>, vars: TweenOptions) => {
    if (!target) return;
    const prevRaf = activeTweens.get(target);
    if (prevRaf !== undefined) {
      cancelAnimationFrame(prevRaf);
    }

    const { duration = 0.6, ease = 'power3.out', onUpdate, ...props } = vars;
    const keys = Object.keys(props).filter((k) => typeof target[k] === 'number' && typeof props[k] === 'number');

    if (duration <= 0.001 || keys.length === 0) {
      keys.forEach((k) => {
        target[k] = props[k];
      });
      if (onUpdate) onUpdate();
      return;
    }

    const startValues: Record<string, number> = {};
    keys.forEach((k) => {
      startValues[k] = target[k];
    });

    const startTime = performance.now();
    const durationMs = duration * 1000;

    const getEase = (t: number): number => {
      if (ease === 'power2.out') return 1 - Math.pow(1 - t, 2);
      if (ease === 'power3.inOut') {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
      // Default power3.out
      return 1 - Math.pow(1 - t, 3);
    };

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = getEase(progress);

      keys.forEach((k) => {
        target[k] = startValues[k] + (props[k] - startValues[k]) * eased;
      });

      if (onUpdate) onUpdate();

      if (progress < 1) {
        const nextRaf = requestAnimationFrame(tick);
        activeTweens.set(target, nextRaf);
      } else {
        activeTweens.delete(target);
      }
    };

    const rafId = requestAnimationFrame(tick);
    activeTweens.set(target, rafId);
  },
};

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type ViewMode = 'rendered' | 'wireframe' | 'exploded';
export type ActiveTab = 'parametric' | 'inspector' | 'academy' | 'architecture';
export type CameraPreset = 'isometric' | 'front' | 'top' | 'mesh_closeup' | 'exploded_view';
export type ComponentId = 'pinion' | 'gear' | 'shaft_in' | 'shaft_out' | 'bearings' | 'housing';

export interface GearSystemParams {
  n1: number;              // Drive Pinion tooth count (12 - 36)
  n2: number;              // Driven Gear tooth count (12 - 64)
  module: number;          // Metric module in mm (2.0 - 5.0)
  pressureAngleDeg: number;// Standard 20 deg
  rpm1: number;            // Input speed (0 - 3000 RPM)
  torqueIn: number;        // Input torque (10 - 500 Nm)
  direction: 1 | -1;       // 1 = CCW, -1 = CW
  efficiency: number;      // Mesh efficiency (0.985 = 98.5%)
}

export interface GearKinematicsResult {
  ratio: number;                // i = N2 / N1
  rpm2: number;                 // Signed output RPM
  omega1: number;               // rad/s
  omega2: number;               // rad/s
  pitchDiameter1: number;       // d1 = m * N1 (mm)
  pitchDiameter2: number;       // d2 = m * N2 (mm)
  outerDiameter1: number;       // da1 = d1 + 2m (mm)
  outerDiameter2: number;       // da2 = d2 + 2m (mm)
  rootDiameter1: number;        // df1 = d1 - 2.5m (mm)
  rootDiameter2: number;        // df2 = d2 - 2.5m (mm)
  baseDiameter1: number;        // db1 = d1 * cos(alpha) (mm)
  baseDiameter2: number;        // db2 = d2 * cos(alpha) (mm)
  centerDistance: number;       // C = (d1 + d2) / 2 (mm)
  addendum: number;             // ha = m (mm)
  dedendum: number;             // hf = 1.25 * m (mm)
  circularPitch: number;        // p = pi * m (mm)
  pitchLineVelocity: number;    // vp (m/s)
  torqueOut: number;            // Nm
  powerKw: number;              // Mechanical power transmitted (kW)
  tangentialForce: number;      // Ft (N)
  radialForce: number;          // Fr (N)
  contactRatio: number;         // Transverse contact ratio epsilon_alpha
  classification: 'SPEED REDUCER' | 'DIRECT 1:1 DRIVE' | 'OVERDRIVE MULTIPLIER';
}

export interface ComponentMetadata {
  id: ComponentId;
  code: string;
  name: string;
  material: string;
  hardness: string;
  surfaceFinish: string;
  massKg: number;
  description: string;
  engineeringNotes: string;
}

// ============================================================================
// 2. PURE MECHANICAL ENGINEERING CALCULATION MODULE
// ============================================================================

export function calculateGearKinematics(params: GearSystemParams): GearKinematicsResult {
  const { n1, n2, module: m, pressureAngleDeg, rpm1, torqueIn, direction, efficiency } = params;
  const alphaRad = (pressureAngleDeg * Math.PI) / 180;

  const ratio = n2 / n1;
  const rpm2 = -(rpm1 * (n1 / n2)) * direction;

  const omega1 = ((rpm1 * 2 * Math.PI) / 60) * direction;
  const omega2 = -omega1 * (n1 / n2);

  const pitchDiameter1 = m * n1;
  const pitchDiameter2 = m * n2;

  const addendum = m;
  const dedendum = 1.25 * m;

  const outerDiameter1 = pitchDiameter1 + 2 * addendum;
  const outerDiameter2 = pitchDiameter2 + 2 * addendum;

  const rootDiameter1 = pitchDiameter1 - 2 * dedendum;
  const rootDiameter2 = pitchDiameter2 - 2 * dedendum;

  const baseDiameter1 = pitchDiameter1 * Math.cos(alphaRad);
  const baseDiameter2 = pitchDiameter2 * Math.cos(alphaRad);

  const centerDistance = (pitchDiameter1 + pitchDiameter2) / 2;
  const circularPitch = Math.PI * m;

  // Pitch line velocity in m/s: (pi * d1_mm * rpm1) / (60 * 1000)
  const pitchLineVelocity = (Math.PI * pitchDiameter1 * rpm1) / 60000;

  // Ideal Output Torque with mesh efficiency
  const torqueOut = torqueIn * ratio * efficiency;

  // Power in kW: P = (T * omega) / 1000
  const powerKw = (torqueIn * Math.abs(omega1)) / 1000;

  // Gear tooth forces
  const r1Meters = (pitchDiameter1 / 2) / 1000;
  const tangentialForce = r1Meters > 0 ? torqueIn / r1Meters : 0;
  const radialForce = tangentialForce * Math.tan(alphaRad);

  // Transverse Contact Ratio (epsilon_alpha)
  // Path of contact length / base pitch
  const ra1 = outerDiameter1 / 2;
  const ra2 = outerDiameter2 / 2;
  const rb1 = baseDiameter1 / 2;
  const rb2 = baseDiameter2 / 2;
  const r1 = pitchDiameter1 / 2;
  const r2 = pitchDiameter2 / 2;

  const term1 = Math.sqrt(Math.max(0, ra1 * ra1 - rb1 * rb1));
  const term2 = Math.sqrt(Math.max(0, ra2 * ra2 - rb2 * rb2));
  const term3 = (r1 + r2) * Math.sin(alphaRad);
  const basePitch = circularPitch * Math.cos(alphaRad);
  const contactRatio = basePitch > 0 ? (term1 + term2 - term3) / basePitch : 1.5;

  let classification: GearKinematicsResult['classification'] = 'DIRECT 1:1 DRIVE';
  if (ratio > 1.02) classification = 'SPEED REDUCER';
  else if (ratio < 0.98) classification = 'OVERDRIVE MULTIPLIER';

  return {
    ratio,
    rpm2,
    omega1,
    omega2,
    pitchDiameter1,
    pitchDiameter2,
    outerDiameter1,
    outerDiameter2,
    rootDiameter1,
    rootDiameter2,
    baseDiameter1,
    baseDiameter2,
    centerDistance,
    addendum,
    dedendum,
    circularPitch,
    pitchLineVelocity,
    torqueOut,
    powerKw,
    tangentialForce,
    radialForce,
    contactRatio,
    classification,
  };
}

// ============================================================================
// 3. PROCEDURAL 3D INVOLUTE SPUR GEAR GEOMETRY GENERATOR
// ============================================================================

/**
 * Generates a mathematically authentic 3D involute spur gear geometry
 * with involute tooth flanks, root clearances, lightening holes, and keyway bore.
 * Scaled in scene units where 1 unit = 10 mm for optimal Three.js camera precision.
 */
const SCENE_SCALE = 0.05; // 1 mm = 0.05 Three.js scene units

export function createInvoluteSpurGearGeometry(
  teethCount: number,
  moduleMm: number,
  pressureAngleDeg: number = 20,
  faceWidthMm: number = 18,
  boreRadiusMm: number = 8,
  lighteningHolesCount: number = 6
): THREE.ExtrudeGeometry {
  const m = moduleMm * SCENE_SCALE;
  const N = teethCount;
  const alpha = (pressureAngleDeg * Math.PI) / 180;

  const pitchRadius = (m * N) / 2;
  const baseRadius = pitchRadius * Math.cos(alpha);
  const addendum = 1.0 * m;
  const dedendum = 1.25 * m;
  const outerRadius = pitchRadius + addendum;
  const rootRadius = Math.max(boreRadiusMm * SCENE_SCALE * 1.4, pitchRadius - dedendum);

  // Involute function inv(phi) = tan(phi) - phi
  const inv = (phi: number) => Math.tan(phi) - phi;
  const invAlpha = inv(alpha);

  // Angular tooth thickness at pitch circle is pi / (2N)
  // Add small backlash allowance (2%) so meshing gears look crisp
  const halfToothAnglePitch = (Math.PI / (2 * N)) * 0.97;
  const halfToothAngleBase = halfToothAnglePitch + invAlpha;

  // Helper to compute point on involute curve at radius r
  const getInvolutePoint = (r: number, side: 1 | -1, centerAngle: number): THREE.Vector2 => {
    if (r <= baseRadius) {
      const angle = centerAngle + side * halfToothAngleBase;
      return new THREE.Vector2(r * Math.cos(angle), r * Math.sin(angle));
    }
    const phi = Math.acos(Math.min(1, baseRadius / r));
    const invPhi = inv(phi);
    const angle = centerAngle + side * (halfToothAngleBase - invPhi);
    return new THREE.Vector2(r * Math.cos(angle), r * Math.sin(angle));
  };

  const gearShape = new THREE.Shape();
  const involuteSteps = 7;
  const startR = Math.max(rootRadius, baseRadius);

  for (let i = 0; i < N; i++) {
    const toothCenterAngle = (i * 2 * Math.PI) / N;
    const nextToothCenterAngle = ((i + 1) * 2 * Math.PI) / N;

    // Root point before left flank
    const leftRootAngle = toothCenterAngle - halfToothAngleBase * 1.03;
    const leftRootPt = new THREE.Vector2(
      rootRadius * Math.cos(leftRootAngle),
      rootRadius * Math.sin(leftRootAngle)
    );

    if (i === 0) {
      gearShape.moveTo(leftRootPt.x, leftRootPt.y);
    } else {
      gearShape.lineTo(leftRootPt.x, leftRootPt.y);
    }

    // Left Involute Flank (rising from base/root to outer radius)
    for (let s = 0; s <= involuteSteps; s++) {
      const t = s / involuteSteps;
      const r = startR + t * (outerRadius - startR);
      const pt = getInvolutePoint(r, -1, toothCenterAngle);
      gearShape.lineTo(pt.x, pt.y);
    }

    // Top Land Arc
    const topRightPt = getInvolutePoint(outerRadius, 1, toothCenterAngle);
    gearShape.lineTo(topRightPt.x, topRightPt.y);

    // Right Involute Flank (descending from outer radius to base/root)
    for (let s = involuteSteps - 1; s >= 0; s--) {
      const t = s / involuteSteps;
      const r = startR + t * (outerRadius - startR);
      const pt = getInvolutePoint(r, 1, toothCenterAngle);
      gearShape.lineTo(pt.x, pt.y);
    }

    // Right Root Point
    const rightRootAngle = toothCenterAngle + halfToothAngleBase * 1.03;
    const rightRootPt = new THREE.Vector2(
      rootRadius * Math.cos(rightRootAngle),
      rootRadius * Math.sin(rightRootAngle)
    );
    gearShape.lineTo(rightRootPt.x, rightRootPt.y);

    // Root Land midpoint to preserve circularity between teeth
    const midRootAngle = (toothCenterAngle + nextToothCenterAngle) / 2;
    const midRootPt = new THREE.Vector2(
      rootRadius * Math.cos(midRootAngle),
      rootRadius * Math.sin(midRootAngle)
    );
    gearShape.lineTo(midRootPt.x, midRootPt.y);
  }
  gearShape.closePath();

  // Central Bore with Machined Keyway Slot
  const boreR = boreRadiusMm * SCENE_SCALE;
  const keywayWidth = boreR * 0.45;
  const keywayDepth = boreR * 0.28;
  const boreHole = new THREE.Path();
  const boreSegments = 40;
  const keywayHalfAngle = Math.asin(Math.min(0.9, (keywayWidth / 2) / boreR));

  // Start just after keyway at top (+X axis)
  for (let s = 0; s <= boreSegments; s++) {
    const t = s / boreSegments;
    const angle = keywayHalfAngle + t * (2 * Math.PI - 2 * keywayHalfAngle);
    const px = boreR * Math.cos(angle);
    const py = boreR * Math.sin(angle);
    if (s === 0) boreHole.moveTo(px, py);
    else boreHole.lineTo(px, py);
  }

  // Keyway notch along +X axis
  const kwX = boreR * Math.cos(keywayHalfAngle) + keywayDepth;
  const kwY = keywayWidth / 2;
  boreHole.lineTo(kwX, -kwY);
  boreHole.lineTo(kwX, kwY);
  boreHole.closePath();
  gearShape.holes.push(boreHole);

  // Lightening Bores (if radial web space allows)
  const webInnerR = boreR * 1.75;
  const webOuterR = rootRadius * 0.78;
  const radialSpace = webOuterR - webInnerR;

  if (radialSpace > m * 1.6 && lighteningHolesCount > 0) {
    const holeRingR = (webInnerR + webOuterR) / 2;
    const holeR = Math.min(radialSpace * 0.38, (holeRingR * Math.PI) / (lighteningHolesCount * 1.7));

    if (holeR > m * 0.4) {
      for (let h = 0; h < lighteningHolesCount; h++) {
        const hAngle = (h * 2 * Math.PI) / lighteningHolesCount;
        const hx = holeRingR * Math.cos(hAngle);
        const hy = holeRingR * Math.sin(hAngle);
        const lighteningPath = new THREE.Path();
        lighteningPath.absarc(hx, hy, holeR, 0, Math.PI * 2, false);
        gearShape.holes.push(lighteningPath);
      }
    }
  }

  const extrudeDepth = faceWidthMm * SCENE_SCALE;
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: Math.min(0.035, m * 0.16),
    bevelSize: Math.min(0.03, m * 0.14),
    bevelSegments: 2,
    curveSegments: 16,
  };

  const geometry = new THREE.ExtrudeGeometry(gearShape, extrudeSettings);
  // Center geometry along Z axis
  geometry.translate(0, 0, -extrudeDepth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// ============================================================================
// 4. ENGINEERING CHALLENGE DEFINITIONS
// ============================================================================

export interface EngineeringChallenge {
  id: number;
  code: string;
  title: string;
  objective: string;
  constraints: string[];
  hint: string;
  validate: (params: GearSystemParams, kin: GearKinematicsResult) => { passed: boolean; progressText: string };
}

export const ENGINEERING_CHALLENGES: EngineeringChallenge[] = [
  {
    id: 1,
    code: 'CH-01 // HEAVY TORQUE REDUCER',
    title: '3.00:1 Precision Torque Reducer',
    objective: 'Configure a 3.00:1 speed reduction stage with an exact shaft Center Distance of 120.0 mm capable of delivering at least 425 Nm of output torque.',
    constraints: [
      'Gear Ratio (i) = 3.00 : 1',
      'Center Distance (C) = 120.0 mm',
      'Output Torque (τ_out) ≥ 425.0 Nm'
    ],
    hint: 'Recall C = m·(N₁ + N₂)/2. With N₂ = 3·N₁, try N₁ = 20, N₂ = 60, Module m = 3.0 mm, and increase Input Torque ≥ 145 Nm.',
    validate: (params, kin) => {
      const ratioOk = Math.abs(kin.ratio - 3.0) < 0.01;
      const cdOk = Math.abs(kin.centerDistance - 120.0) < 0.1;
      const torqueOk = kin.torqueOut >= 425.0;
      const passed = ratioOk && cdOk && torqueOk;
      return {
        passed,
        progressText: `Ratio: ${kin.ratio.toFixed(2)}:1 ${ratioOk ? '✓' : '✗'} | C: ${kin.centerDistance.toFixed(1)}mm ${cdOk ? '✓' : '✗'} | τ_out: ${kin.torqueOut.toFixed(1)}Nm ${torqueOk ? '✓' : '✗'}`
      };
    }
  },
  {
    id: 2,
    code: 'CH-02 // SYNCHRONIZED COUNTER-DRIVE',
    title: '600 RPM CW Output Drive Stage',
    objective: 'Deliver an exact +600 RPM Counter-Clockwise or Clockwise synchronized output from an 1800 RPM input while keeping Pitch Line Velocity under 4.0 m/s.',
    constraints: [
      'Absolute Output Speed |RPM₂| = 600 RPM',
      'Input Speed RPM₁ = 1800 RPM',
      'Pitch Line Velocity (v_p) < 4.00 m/s'
    ],
    hint: 'Set RPM₁ = 1800 and a 3.00:1 ratio (e.g., N₁ = 16, N₂ = 48). Reduce Module to 2.0 or 2.5 mm so v_p stays below 4.0 m/s.',
    validate: (params, kin) => {
      const rpm1Ok = Math.abs(params.rpm1 - 1800) < 5;
      const rpm2Ok = Math.abs(Math.abs(kin.rpm2) - 600) < 2;
      const velOk = kin.pitchLineVelocity > 0.1 && kin.pitchLineVelocity < 4.0;
      const passed = rpm1Ok && rpm2Ok && velOk;
      return {
        passed,
        progressText: `RPM₁: ${params.rpm1} ${rpm1Ok ? '✓' : '✗'} | |RPM₂|: ${Math.abs(kin.rpm2).toFixed(0)} ${rpm2Ok ? '✓' : '✗'} | v_p: ${kin.pitchLineVelocity.toFixed(2)}m/s ${velOk ? '✓' : '✗'}`
      };
    }
  },
  {
    id: 3,
    code: 'CH-03 // COMPACT OVERDRIVE STAGE',
    title: 'High-Speed 0.50:1 Multiplier Package',
    objective: 'Design a compact overdrive multiplier where output speed is double the input speed (i = 0.50:1) within a compact envelope (Center Distance ≤ 60.0 mm).',
    constraints: [
      'Gear Ratio (i) = 0.50 : 1 (Overdrive)',
      'Center Distance (C) ≤ 60.0 mm',
      'Transverse Contact Ratio (ε_α) ≥ 1.45'
    ],
    hint: 'For a 0.50:1 ratio, the drive pinion must have twice as many teeth as the driven gear (e.g., N₁ = 32, N₂ = 16) with Module m = 2.0 or 2.5 mm.',
    validate: (params, kin) => {
      const ratioOk = Math.abs(kin.ratio - 0.5) < 0.01;
      const cdOk = kin.centerDistance <= 60.0;
      const crOk = kin.contactRatio >= 1.45;
      const passed = ratioOk && cdOk && crOk;
      return {
        passed,
        progressText: `Ratio: ${kin.ratio.toFixed(2)}:1 ${ratioOk ? '✓' : '✗'} | C: ${kin.centerDistance.toFixed(1)}mm ${cdOk ? '✓' : '✗'} | ε_α: ${kin.contactRatio.toFixed(2)} ${crOk ? '✓' : '✗'}`
      };
    }
  }
];

// ============================================================================
// 5. COMPONENT METADATA CATALOG
// ============================================================================

export const COMPONENT_CATALOG: Record<ComponentId, ComponentMetadata> = {
  pinion: {
    id: 'pinion',
    code: 'ASM-G01 // DRIVE PINION',
    name: 'Involute Drive Pinion (G₁)',
    material: 'AISI 8620 Case-Hardened Alloy Steel',
    hardness: '58–62 HRC (Carburized Flanks)',
    surfaceFinish: 'Ra 0.4 μm CNC Ground Involute',
    massKg: 0.84,
    description: 'Primary torque input element featuring DIN 867 standard 20° pressure angle involute teeth, integral hub boss, and DIN 6885 parallel keyway.',
    engineeringNotes: 'Subject to highest cyclic bending and Hertzian contact frequency. Lightening bores reduce rotational inertia by 18%.'
  },
  gear: {
    id: 'gear',
    code: 'ASM-G02 // DRIVEN WHEEL',
    name: 'Driven Spur Gear Wheel (G₂)',
    material: 'Ti-6Al-4V Grade 5 Dark Titanium / 4140 Steel',
    hardness: '54–58 HRC (Nitride Treated)',
    surfaceFinish: 'Ra 0.6 μm Honed Tooth Profile',
    massKg: 2.15,
    description: 'Secondary output spur gear wheel engaged in conjugate mesh with the drive pinion. Rotates in opposing direction to external input shaft.',
    engineeringNotes: 'Precision machined web cutouts balance centrifugal stress distribution while maintaining torsional stiffness.'
  },
  shaft_in: {
    id: 'shaft_in',
    code: 'ASM-S01 // INPUT SHAFT',
    name: 'Stepped Drive Shaft & Parallel Key (S₁)',
    material: 'AISI 4140 Chromoly Steel (Normalized)',
    hardness: '32–36 HRC',
    surfaceFinish: 'Ra 0.3 μm Precision Cylindrical Ground',
    massKg: 0.62,
    description: 'Stepped power transmission shaft transmitting motor torque to the drive pinion via a press-fit parallel key.',
    engineeringNotes: 'Designed with shoulder fillets to minimize torsional and bending stress concentrations at bearing journals.'
  },
  shaft_out: {
    id: 'shaft_out',
    code: 'ASM-S02 // OUTPUT SHAFT',
    name: 'Driven Output Transmission Shaft (S₂)',
    material: 'AISI 4340 Nickel-Chromoly Steel',
    hardness: '38–42 HRC',
    surfaceFinish: 'Ra 0.3 μm Precision Ground',
    massKg: 0.78,
    description: 'Heavy-duty output shaft engineered to withstand amplified output torque and radial mesh reaction loads.',
    engineeringNotes: 'Larger journal diameter accommodates elevated bending moments induced by tangential (F_t) and radial (F_r) tooth forces.'
  },
  bearings: {
    id: 'bearings',
    code: 'ASM-B04 // BEARING SET',
    name: 'Deep-Groove Precision Ball Bearings (ISO P5)',
    material: 'AISI 52100 High-Carbon Chromium Bearing Steel',
    hardness: '60–64 HRC Races & Balls',
    surfaceFinish: 'Ra 0.08 μm Superfinished Raceway',
    massKg: 0.44,
    description: 'Quad-mounted radial ball bearing assemblies supporting both input and output shafts with zero axial play.',
    engineeringNotes: 'Absorbs vector resultant radial load F_total = √(F_t² + F_r²) generated along the 20° line of action.'
  },
  housing: {
    id: 'housing',
    code: 'ASM-H01 // CARRIER FRAME',
    name: 'Variable-Center Split Bearing Carrier Frame',
    material: 'EN-GJS-500-7 Cast Ductile Iron / 7075-T6 Base',
    hardness: '210 HBW Hard Anodized Coating',
    surfaceFinish: 'Ra 1.6 μm CNC Line-Bored',
    massKg: 4.80,
    description: 'Precision-machined gearbox testbed frame featuring twin bearing pedestals and variable center-distance alignment rails.',
    engineeringNotes: 'Maintains shaft parallelism within ±0.008 mm to guarantee uniform face-width tooth contact.'
  }
};

// ============================================================================
// 6. 3D GEAR ASSEMBLY SCENE COMPONENT (REACT THREE FIBER + GSAP)
// ============================================================================

interface SceneAssemblyProps {
  params: GearSystemParams;
  kinematics: GearKinematicsResult;
  viewMode: ViewMode;
  explodeFactor: number;
  isPlaying: boolean;
  simSpeed: number;
  showPitchVectors: boolean;
  showAnnotations: boolean;
  selectedComponent: ComponentId | null;
  isolatedComponent: ComponentId | null;
  onSelectComponent: (id: ComponentId | null) => void;
  cameraPreset: CameraPreset;
  resetTrigger: number;
  stepTrigger: number;
  telemetryRef: React.MutableRefObject<{ theta1Deg: number; theta2Deg: number; fps: number }>;
  reducedMotion: boolean;
}

const GearAssemblyViewport: React.FC<SceneAssemblyProps> = ({
  params,
  kinematics,
  viewMode,
  explodeFactor,
  isPlaying,
  simSpeed,
  showPitchVectors,
  showAnnotations,
  selectedComponent,
  isolatedComponent,
  onSelectComponent,
  cameraPreset,
  resetTrigger,
  stepTrigger,
  telemetryRef,
  reducedMotion,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Screen-space projected coordinates for 3D callout labels
  const [labelCoords, setLabelCoords] = useState<{
    pinion: { x: number; y: number; visible: boolean };
    gear: { x: number; y: number; visible: boolean };
    pitch: { x: number; y: number; visible: boolean };
  }>({
    pinion: { x: -999, y: -999, visible: false },
    gear: { x: -999, y: -999, visible: false },
    pitch: { x: -999, y: -999, visible: false },
  });

  // Latest reactive props stored in ref for the 60fps requestAnimationFrame loop
  const latestPropsRef = useRef({
    params,
    kinematics,
    viewMode,
    explodeFactor,
    isPlaying,
    simSpeed,
    showPitchVectors,
    showAnnotations,
    selectedComponent,
    isolatedComponent,
    onSelectComponent,
    reducedMotion,
  });

  useEffect(() => {
    latestPropsRef.current = {
      params,
      kinematics,
      viewMode,
      explodeFactor,
      isPlaying,
      simSpeed,
      showPitchVectors,
      showAnnotations,
      selectedComponent,
      isolatedComponent,
      onSelectComponent,
      reducedMotion,
    };
  });

  // Scene & Mesh Group Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, -0.2, 0));

  const pinionGroupRef = useRef<THREE.Group | null>(null);
  const gearGroupRef = useRef<THREE.Group | null>(null);
  const shaftInGroupRef = useRef<THREE.Group | null>(null);
  const shaftOutGroupRef = useRef<THREE.Group | null>(null);
  const bearingsGroupRef = useRef<THREE.Group | null>(null);
  const bearingsInFrontRef = useRef<THREE.Group | null>(null);
  const bearingsInBackRef = useRef<THREE.Group | null>(null);
  const bearingsOutFrontRef = useRef<THREE.Group | null>(null);
  const bearingsOutBackRef = useRef<THREE.Group | null>(null);
  const housingGroupRef = useRef<THREE.Group | null>(null);
  const housingFrontRef = useRef<THREE.Group | null>(null);
  const housingBackRef = useRef<THREE.Group | null>(null);
  const housingBaseRef = useRef<THREE.Group | null>(null);
  const vectorsGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);

  const pinionMeshRef = useRef<THREE.Mesh | null>(null);
  const gearMeshRef = useRef<THREE.Mesh | null>(null);

  const phaseAngleRef = useRef<number>(0);
  const animatedExplodeRef = useRef<{ value: number }>({ value: 0 });

  // Helper to tag all child meshes with a componentId for raycasting
  const tagComponentMeshes = (group: THREE.Object3D, componentId: ComponentId) => {
    group.userData.componentId = componentId;
    group.traverse((child) => {
      child.userData.componentId = componentId;
    });
  };

  // Build bearing sub-assembly in pure Three.js
  const buildBearingSubGroup = (innerR: number, outerR: number, width: number): THREE.Group => {
    const group = new THREE.Group();
    const ballPitchR = (innerR + outerR) / 2;
    const ballR = (outerR - innerR) * 0.34;
    const ballsCount = 8;

    const outerRaceGeo = new THREE.CylinderGeometry(outerR, outerR, width, 28, 1, true);
    const outerRaceMat = new THREE.MeshStandardMaterial({
      color: '#4A5568',
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    outerRaceMat.userData = { baseColor: '#4A5568', isBearingRace: true };
    const outerRace = new THREE.Mesh(outerRaceGeo, outerRaceMat);
    outerRace.rotation.x = Math.PI / 2;
    group.add(outerRace);

    const innerRaceGeo = new THREE.CylinderGeometry(innerR, innerR, width * 1.05, 24, 1, true);
    const innerRaceMat = new THREE.MeshStandardMaterial({
      color: '#718096',
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    innerRaceMat.userData = { baseColor: '#718096', isBearingRace: true };
    const innerRace = new THREE.Mesh(innerRaceGeo, innerRaceMat);
    innerRace.rotation.x = Math.PI / 2;
    group.add(innerRace);

    const ballGeo = new THREE.SphereGeometry(ballR, 12, 12);
    const ballMat = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      metalness: 0.96,
      roughness: 0.1,
    });
    ballMat.userData = { baseColor: '#E2E8F0' };

    for (let i = 0; i < ballsCount; i++) {
      const angle = (i * 2 * Math.PI) / ballsCount;
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.position.set(ballPitchR * Math.cos(angle), ballPitchR * Math.sin(angle), 0);
      group.add(ball);
    }

    return group;
  };

  // 1. Initialize Pure Three.js Scene, Camera, Renderer, Lights & Orbit Controls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080A0E');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 120);
    camera.position.set(0, 4.2, 8.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Industrial Lighting
    const ambientLight = new THREE.AmbientLight('#C8D4E3', 0.85);
    scene.add(ambientLight);

    const mainDirLight = new THREE.DirectionalLight('#F3F5F7', 2.2);
    mainDirLight.position.set(7, 12, 9);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.set(1024, 1024);
    scene.add(mainDirLight);

    const fillDirLight = new THREE.DirectionalLight('#6488B4', 1.15);
    fillDirLight.position.set(-9, 5, -7);
    scene.add(fillDirLight);

    const rimSpotLight = new THREE.SpotLight('#FF9F43', 3.4);
    rimSpotLight.position.set(0, 7, -9);
    rimSpotLight.angle = 0.65;
    rimSpotLight.penumbra = 0.8;
    scene.add(rimSpotLight);

    const pitchPointLight = new THREE.PointLight('#FF9F43', 1.1, 5.0);
    pitchPointLight.position.set(0, 0.4, 1.8);
    scene.add(pitchPointLight);

    // 1. DRIVE PINION GROUP (G1)
    const pinionGroup = new THREE.Group();
    const pinionMat = new THREE.MeshStandardMaterial({
      color: '#B8C2CC',
      metalness: 0.88,
      roughness: 0.24,
    });
    const pinionMesh = new THREE.Mesh(new THREE.BufferGeometry(), pinionMat);
    pinionMesh.castShadow = true;
    pinionMesh.receiveShadow = true;
    pinionMeshRef.current = pinionMesh;
    pinionGroup.add(pinionMesh);

    const pinionBossMat = new THREE.MeshStandardMaterial({
      color: '#8F9BA8',
      metalness: 0.85,
      roughness: 0.3,
    });
    const pinionBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.12, 32), pinionBossMat);
    pinionBoss.rotation.x = Math.PI / 2;
    pinionGroup.add(pinionBoss);
    tagComponentMeshes(pinionGroup, 'pinion');
    pinionGroupRef.current = pinionGroup;
    scene.add(pinionGroup);

    // 2. DRIVEN GEAR GROUP (G2)
    const gearGroup = new THREE.Group();
    const gearMat = new THREE.MeshStandardMaterial({
      color: '#6C7886',
      metalness: 0.86,
      roughness: 0.28,
    });
    const gearMesh = new THREE.Mesh(new THREE.BufferGeometry(), gearMat);
    gearMesh.castShadow = true;
    gearMesh.receiveShadow = true;
    gearMeshRef.current = gearMesh;
    gearGroup.add(gearMesh);

    const gearBossMat = new THREE.MeshStandardMaterial({
      color: '#525C68',
      metalness: 0.82,
      roughness: 0.34,
    });
    const gearBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.12, 32), gearBossMat);
    gearBoss.rotation.x = Math.PI / 2;
    gearGroup.add(gearBoss);
    tagComponentMeshes(gearGroup, 'gear');
    gearGroupRef.current = gearGroup;
    scene.add(gearGroup);

    // 3. INPUT SHAFT GROUP (S1)
    const shaftInGroup = new THREE.Group();
    const shaftInMain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.37, 3.4, 28),
      new THREE.MeshStandardMaterial({ color: '#D0D7DE', metalness: 0.92, roughness: 0.18 })
    );
    shaftInMain.rotation.x = Math.PI / 2;
    shaftInMain.castShadow = true;
    shaftInGroup.add(shaftInMain);

    const shaftInExt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1.1, 24),
      new THREE.MeshStandardMaterial({ color: '#9BA6B2', metalness: 0.9, roughness: 0.22 })
    );
    shaftInExt.rotation.x = Math.PI / 2;
    shaftInExt.position.set(0, 0, -2.0);
    shaftInGroup.add(shaftInExt);

    const keyIn = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.16, 1.25),
      new THREE.MeshStandardMaterial({ color: '#FF9F43', metalness: 0.75, roughness: 0.25 })
    );
    keyIn.position.set(0.39, 0, 0);
    shaftInGroup.add(keyIn);
    tagComponentMeshes(shaftInGroup, 'shaft_in');
    shaftInGroupRef.current = shaftInGroup;
    scene.add(shaftInGroup);

    // 4. OUTPUT SHAFT GROUP (S2)
    const shaftOutGroup = new THREE.Group();
    const shaftOutMain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.47, 3.4, 28),
      new THREE.MeshStandardMaterial({ color: '#C2CAD2', metalness: 0.92, roughness: 0.18 })
    );
    shaftOutMain.rotation.x = Math.PI / 2;
    shaftOutMain.castShadow = true;
    shaftOutGroup.add(shaftOutMain);

    const shaftOutExt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 1.1, 24),
      new THREE.MeshStandardMaterial({ color: '#9BA6B2', metalness: 0.9, roughness: 0.22 })
    );
    shaftOutExt.rotation.x = Math.PI / 2;
    shaftOutExt.position.set(0, 0, 2.0);
    shaftOutGroup.add(shaftOutExt);

    const keyOut = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.18, 1.25),
      new THREE.MeshStandardMaterial({ color: '#FF9F43', metalness: 0.75, roughness: 0.25 })
    );
    keyOut.position.set(0.49, 0, 0);
    shaftOutGroup.add(keyOut);
    tagComponentMeshes(shaftOutGroup, 'shaft_out');
    shaftOutGroupRef.current = shaftOutGroup;
    scene.add(shaftOutGroup);

    // 5. PRECISION BALL BEARINGS (B1-B4)
    const bearingsGroup = new THREE.Group();
    const bInFront = buildBearingSubGroup(0.38, 0.68, 0.28);
    const bInBack = buildBearingSubGroup(0.38, 0.68, 0.28);
    const bOutFront = buildBearingSubGroup(0.48, 0.82, 0.32);
    const bOutBack = buildBearingSubGroup(0.48, 0.82, 0.32);

    bearingsInFrontRef.current = bInFront;
    bearingsInBackRef.current = bInBack;
    bearingsOutFrontRef.current = bOutFront;
    bearingsOutBackRef.current = bOutBack;

    bearingsGroup.add(bInFront, bInBack, bOutFront, bOutBack);
    tagComponentMeshes(bearingsGroup, 'bearings');
    bearingsGroupRef.current = bearingsGroup;
    scene.add(bearingsGroup);

    // 6. VARIABLE-CENTER CARRIER HOUSING (H1)
    const housingGroup = new THREE.Group();
    const housingFront = new THREE.Group();
    const housingBack = new THREE.Group();
    const housingBase = new THREE.Group();

    housingFrontRef.current = housingFront;
    housingBackRef.current = housingBack;
    housingBaseRef.current = housingBase;

    housingGroup.add(housingFront, housingBack, housingBase);
    housingGroupRef.current = housingGroup;
    scene.add(housingGroup);

    // 7. VECTORS & REFERENCE GRID GROUPS
    const vectorsGroup = new THREE.Group();
    vectorsGroupRef.current = vectorsGroup;
    scene.add(vectorsGroup);

    const gridGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(28, 56, '#2B3440', '#161D27');
    gridGroup.add(gridHelper);
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    // -------------------------------------------------------------------------
    // CUSTOM ORBIT / PAN / ZOOM & RAYCAST POINTER INTERACTION
    // -------------------------------------------------------------------------
    let isDragging = false;
    let dragButton = 0;
    let pointerDownPos = { x: 0, y: 0 };
    let prevPointerPos = { x: 0, y: 0 };

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragButton = e.button;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      prevPointerPos = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !cameraRef.current) return;
      const dx = e.clientX - prevPointerPos.x;
      const dy = e.clientY - prevPointerPos.y;
      prevPointerPos = { x: e.clientX, y: e.clientY };

      const cam = cameraRef.current;
      const target = orbitTargetRef.current;

      if (dragButton === 0 && !e.shiftKey) {
        // Orbit around target
        const offset = cam.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= dx * 0.0075;
        spherical.phi = Math.max(0.12, Math.min(Math.PI * 0.85, spherical.phi - dy * 0.0075));
        offset.setFromSpherical(spherical);
        cam.position.copy(target).add(offset);
        cam.lookAt(target);
      } else {
        // Pan camera and target
        const distance = cam.position.distanceTo(target);
        const panSpeed = distance * 0.0012;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0).multiplyScalar(-dx * panSpeed);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1).multiplyScalar(dy * panSpeed);
        cam.position.add(right).add(up);
        target.add(right).add(up);
        cam.lookAt(target);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {}

      // Check if click without drag for 3D component selection
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist < 5 && e.button === 0 && cameraRef.current && sceneRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNdc, cameraRef.current);
        const pickableRoots: THREE.Object3D[] = [
          pinionGroup,
          gearGroup,
          shaftInGroup,
          shaftOutGroup,
          bearingsGroup,
          housingGroup,
        ].filter((g) => g.visible);

        const intersects = raycaster.intersectObjects(pickableRoots, true);
        const hit = intersects.find((i) => i.object.userData?.componentId);
        if (hit) {
          latestPropsRef.current.onSelectComponent(hit.object.userData.componentId as ComponentId);
        } else {
          latestPropsRef.current.onSelectComponent(null);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      const cam = cameraRef.current;
      const target = orbitTargetRef.current;
      const offset = cam.position.clone().sub(target);
      const distance = offset.length();
      const scale = e.deltaY > 0 ? 1.09 : 0.91;
      const nextDist = Math.max(1.8, Math.min(28, distance * scale));
      offset.normalize().multiplyScalar(nextDist);
      cam.position.copy(target).add(offset);
      cam.lookAt(target);
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    domElem.addEventListener('pointermove', handlePointerMove);
    domElem.addEventListener('pointerup', handlePointerUp);
    domElem.addEventListener('wheel', handleWheel, { passive: false });
    domElem.addEventListener('contextmenu', handleContextMenu);

    // Resize Observer
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // -------------------------------------------------------------------------
    // 60 FPS ANIMATION & KINEMATICS LOOP
    // -------------------------------------------------------------------------
    let rafId = 0;
    let lastFrameTime = performance.now();
    let fpsFrames = 0;
    let fpsLastCheck = performance.now();
    let lastLabelUpdate = 0;

    const projectWorldToScreen = (worldPt: THREE.Vector3, w: number, h: number) => {
      if (!cameraRef.current) return { x: -999, y: -999, visible: false };
      const projected = worldPt.clone().project(cameraRef.current);
      const visible = projected.z >= -1 && projected.z <= 1;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-(projected.y * 0.5) + 0.5) * h;
      return { x, y, visible };
    };

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const delta = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // 1. FPS Telemetry
      fpsFrames++;
      if (now - fpsLastCheck >= 500) {
        telemetryRef.current.fps = Math.round((fpsFrames * 1000) / (now - fpsLastCheck));
        fpsFrames = 0;
        fpsLastCheck = now;
      }

      const {
        params: curParams,
        kinematics: curKin,
        isPlaying: curPlaying,
        simSpeed: curSpeed,
        showAnnotations: curAnnotations,
      } = latestPropsRef.current;

      // 2. Advance Pinion & Gear Meshing Angles
      if (curPlaying && curParams.rpm1 > 0) {
        const effectiveOmega1 = curKin.omega1 * curSpeed * 0.15;
        phaseAngleRef.current = (phaseAngleRef.current + effectiveOmega1 * delta) % (Math.PI * 200);
      }

      const meshPhaseOffsetRad = Math.PI + Math.PI / curParams.n2;
      const theta1 = phaseAngleRef.current;
      const theta2 = -theta1 * (curParams.n1 / curParams.n2) + meshPhaseOffsetRad;

      telemetryRef.current.theta1Deg = ((theta1 * 180) / Math.PI) % 360;
      telemetryRef.current.theta2Deg = ((theta2 * 180) / Math.PI) % 360;

      if (pinionGroupRef.current) pinionGroupRef.current.rotation.z = theta1;
      if (shaftInGroupRef.current) shaftInGroupRef.current.rotation.z = theta1;
      if (gearGroupRef.current) gearGroupRef.current.rotation.z = theta2;
      if (shaftOutGroupRef.current) shaftOutGroupRef.current.rotation.z = theta2;

      // 3. Apply Center Distance & Exploded View Offsets
      const halfCenterScene = (curKin.centerDistance * SCENE_SCALE) / 2;
      const pinionX = -halfCenterScene;
      const gearX = halfCenterScene;
      const ex = animatedExplodeRef.current.value;

      if (pinionGroupRef.current) pinionGroupRef.current.position.set(pinionX - ex * 0.35, 0, ex * 0.45);
      if (gearGroupRef.current) gearGroupRef.current.position.set(gearX + ex * 0.35, 0, -ex * 0.45);
      if (shaftInGroupRef.current) shaftInGroupRef.current.position.set(pinionX - ex * 0.35, 0, -ex * 1.9);
      if (shaftOutGroupRef.current) shaftOutGroupRef.current.position.set(gearX + ex * 0.35, 0, ex * 1.9);

      if (bearingsInFrontRef.current) bearingsInFrontRef.current.position.set(pinionX - ex * 0.35, 0, 0.95 + ex * 1.35);
      if (bearingsInBackRef.current) bearingsInBackRef.current.position.set(pinionX - ex * 0.35, 0, -0.95 - ex * 1.15);
      if (bearingsOutFrontRef.current) bearingsOutFrontRef.current.position.set(gearX + ex * 0.35, 0, 0.95 + ex * 1.15);
      if (bearingsOutBackRef.current) bearingsOutBackRef.current.position.set(gearX + ex * 0.35, 0, -0.95 - ex * 1.35);

      if (housingFrontRef.current) housingFrontRef.current.position.set(0, 0, 1.15 + ex * 2.45);
      if (housingBackRef.current) housingBackRef.current.position.set(0, 0, -1.15 - ex * 2.45);
      if (housingBaseRef.current) housingBaseRef.current.position.set(0, -ex * 1.4, 0);

      // 4. Update Screen-Projected Callout Positions (~20Hz throttle for smooth HUD)
      if (curAnnotations && now - lastLabelUpdate > 45 && mountRef.current) {
        lastLabelUpdate = now;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        const r1Scene = (curKin.pitchDiameter1 * SCENE_SCALE) / 2;
        const r2Scene = (curKin.pitchDiameter2 * SCENE_SCALE) / 2;
        const pitchPtX = pinionX + r1Scene;

        setLabelCoords({
          pinion: projectWorldToScreen(new THREE.Vector3(pinionX, r1Scene + 0.6, 0), w, h),
          gear: projectWorldToScreen(new THREE.Vector3(gearX, r2Scene + 0.6, 0), w, h),
          pitch: projectWorldToScreen(new THREE.Vector3(pitchPtX, -0.58, 0.65), w, h),
        });
      }

      if (cameraRef.current) {
        cameraRef.current.lookAt(orbitTargetRef.current);
        renderer.render(scene, cameraRef.current);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      domElem.removeEventListener('pointerdown', handlePointerDown);
      domElem.removeEventListener('pointermove', handlePointerMove);
      domElem.removeEventListener('pointerup', handlePointerUp);
      domElem.removeEventListener('wheel', handleWheel);
      domElem.removeEventListener('contextmenu', handleContextMenu);
      renderer.dispose();
    };
  }, []);

  // 2. Rebuild Procedural Involute Gear Geometries, Housing & Vectors when N1, N2, Module change
  useEffect(() => {
    if (!pinionMeshRef.current || !gearMeshRef.current) return;

    const newPinionGeo = createInvoluteSpurGearGeometry(
      params.n1,
      params.module,
      params.pressureAngleDeg,
      18,
      7.5,
      5
    );
    const oldPinionGeo = pinionMeshRef.current.geometry;
    pinionMeshRef.current.geometry = newPinionGeo;
    oldPinionGeo?.dispose();

    const newGearGeo = createInvoluteSpurGearGeometry(
      params.n2,
      params.module,
      params.pressureAngleDeg,
      18,
      9.5,
      6
    );
    const oldGearGeo = gearMeshRef.current.geometry;
    gearMeshRef.current.geometry = newGearGeo;
    oldGearGeo?.dispose();

    // Rebuild dynamic housing & pedestal geometry to match current center distance
    const maxOuterRadiusScene =
      (Math.max(kinematics.outerDiameter1, kinematics.outerDiameter2) * SCENE_SCALE) / 2;
    const basePlateY = -Math.max(2.1, maxOuterRadiusScene + 0.65);
    const frameSpanX = kinematics.centerDistance * SCENE_SCALE + Math.max(2.8, maxOuterRadiusScene * 1.5);

    const clearGroup = (grp: THREE.Group | null) => {
      if (!grp) return;
      while (grp.children.length > 0) {
        const child = grp.children[0] as THREE.Mesh;
        if (child.geometry) child.geometry.dispose();
        grp.remove(child);
      }
    };

    clearGroup(housingFrontRef.current);
    clearGroup(housingBackRef.current);
    clearGroup(housingBaseRef.current);

    if (housingFrontRef.current && housingBackRef.current && housingBaseRef.current && housingGroupRef.current) {
      const frontPlate = new THREE.Mesh(
        new THREE.BoxGeometry(frameSpanX * 0.88, Math.abs(basePlateY) * 0.85, 0.22),
        new THREE.MeshStandardMaterial({
          color: '#1E2631',
          metalness: 0.7,
          roughness: 0.45,
          transparent: true,
          opacity: 0.78,
        })
      );
      frontPlate.position.set(0, basePlateY * 0.48, 0);
      housingFrontRef.current.add(frontPlate);

      const backPlate = new THREE.Mesh(
        new THREE.BoxGeometry(frameSpanX * 0.88, Math.abs(basePlateY) * 0.85, 0.24),
        new THREE.MeshStandardMaterial({
          color: '#1A222C',
          metalness: 0.75,
          roughness: 0.42,
        })
      );
      backPlate.position.set(0, basePlateY * 0.48, 0);
      housingBackRef.current.add(backPlate);

      const baseSlab = new THREE.Mesh(
        new THREE.BoxGeometry(frameSpanX * 1.1, 0.35, 3.6),
        new THREE.MeshStandardMaterial({
          color: '#151B23',
          metalness: 0.8,
          roughness: 0.35,
        })
      );
      baseSlab.position.set(0, basePlateY, 0);
      baseSlab.receiveShadow = true;
      housingBaseRef.current.add(baseSlab);

      const railFront = new THREE.Mesh(
        new THREE.BoxGeometry(frameSpanX * 0.98, 0.08, 0.35),
        new THREE.MeshStandardMaterial({ color: '#2B3440', metalness: 0.85, roughness: 0.25 })
      );
      railFront.position.set(0, basePlateY + 0.2, 1.15);
      housingBaseRef.current.add(railFront);

      const railBack = new THREE.Mesh(
        new THREE.BoxGeometry(frameSpanX * 0.98, 0.08, 0.35),
        new THREE.MeshStandardMaterial({ color: '#2B3440', metalness: 0.85, roughness: 0.25 })
      );
      railBack.position.set(0, basePlateY + 0.2, -1.15);
      housingBaseRef.current.add(railBack);

      tagComponentMeshes(housingGroupRef.current, 'housing');
    }

    if (gridGroupRef.current) {
      gridGroupRef.current.position.set(0, basePlateY - 0.19, 0);
    }

    // Rebuild Pitch Circle & Line of Action Overlays
    clearGroup(vectorsGroupRef.current);
    if (vectorsGroupRef.current) {
      const halfCenterScene = (kinematics.centerDistance * SCENE_SCALE) / 2;
      const pinionX = -halfCenterScene;
      const gearX = halfCenterScene;
      const r1Scene = (kinematics.pitchDiameter1 * SCENE_SCALE) / 2;
      const r2Scene = (kinematics.pitchDiameter2 * SCENE_SCALE) / 2;
      const pitchPointX = pinionX + r1Scene;

      const pts1: THREE.Vector3[] = [];
      const pts2: THREE.Vector3[] = [];
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        pts1.push(new THREE.Vector3(pinionX + r1Scene * Math.cos(a), r1Scene * Math.sin(a), 0.56));
        pts2.push(new THREE.Vector3(gearX + r2Scene * Math.cos(a), r2Scene * Math.sin(a), 0.56));
      }

      const circle1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts1),
        new THREE.LineBasicMaterial({ color: '#FF9F43' })
      );
      const circle2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts2),
        new THREE.LineBasicMaterial({ color: '#56D6A0' })
      );

      const alpha = (params.pressureAngleDeg * Math.PI) / 180;
      const len = Math.min(r1Scene, r2Scene) * 0.95;
      const dx = Math.sin(alpha) * len;
      const dy = Math.cos(alpha) * len;
      const actionLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(pitchPointX - dx, -dy, 0.58),
          new THREE.Vector3(pitchPointX + dx, dy, 0.58),
        ]),
        new THREE.LineBasicMaterial({ color: '#FF6B6B' })
      );

      const centerDistLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(pinionX, 0, 0.56),
          new THREE.Vector3(gearX, 0, 0.56),
        ]),
        new THREE.LineBasicMaterial({ color: '#A0AAB7' })
      );

      const pitchSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 16, 16),
        new THREE.MeshBasicMaterial({ color: '#FF9F43' })
      );
      pitchSphere.position.set(pitchPointX, 0, 0.58);

      vectorsGroupRef.current.add(circle1, circle2, actionLine, centerDistLine, pitchSphere);
    }
  }, [
    params.n1,
    params.n2,
    params.module,
    params.pressureAngleDeg,
    kinematics.centerDistance,
    kinematics.outerDiameter1,
    kinematics.outerDiameter2,
    kinematics.pitchDiameter1,
    kinematics.pitchDiameter2,
  ]);

  // 3. Synchronize Wireframe, Component Isolation, and Selection Highlight Materials
  useEffect(() => {
    const isWireframe = viewMode === 'wireframe';

    const updateGroupVisuals = (
      group: THREE.Group | null,
      id: ComponentId,
      defaultPrimaryColor: string
    ) => {
      if (!group) return;
      group.visible = !isolatedComponent || isolatedComponent === id;
      const isSelected = selectedComponent === id;

      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && 'wireframe' in mat) {
            mat.wireframe = isWireframe;
            if (mesh === pinionMeshRef.current || mesh === gearMeshRef.current) {
              mat.color.set(isSelected ? '#FFB866' : defaultPrimaryColor);
              mat.emissive.set(isSelected ? '#FF9F43' : '#000000');
              mat.emissiveIntensity = isSelected ? 0.22 : 0;
            } else if ('emissive' in mat) {
              mat.emissive.set(isSelected ? '#FF9F43' : '#000000');
              mat.emissiveIntensity = isSelected ? 0.16 : 0;
            }
          }
        }
      });
    };

    updateGroupVisuals(pinionGroupRef.current, 'pinion', '#B8C2CC');
    updateGroupVisuals(gearGroupRef.current, 'gear', '#6C7886');
    updateGroupVisuals(shaftInGroupRef.current, 'shaft_in', '#D0D7DE');
    updateGroupVisuals(shaftOutGroupRef.current, 'shaft_out', '#C2CAD2');
    updateGroupVisuals(bearingsGroupRef.current, 'bearings', '#4A5568');
    updateGroupVisuals(housingGroupRef.current, 'housing', '#1E2631');

    if (vectorsGroupRef.current) {
      vectorsGroupRef.current.visible = showPitchVectors;
    }
  }, [viewMode, selectedComponent, isolatedComponent, showPitchVectors, params.n1, params.n2, params.module]);

  // 4. Reset Phase Trigger
  useEffect(() => {
    if (resetTrigger > 0) {
      phaseAngleRef.current = 0;
    }
  }, [resetTrigger]);

  // 5. Step-By-Tooth Trigger
  useEffect(() => {
    if (stepTrigger > 0) {
      const oneToothPitchRad = (2 * Math.PI) / params.n1;
      gsap.to(phaseAngleRef, {
        current: phaseAngleRef.current + oneToothPitchRad * params.direction,
        duration: reducedMotion ? 0.05 : 0.45,
        ease: 'power2.out',
      });
    }
  }, [stepTrigger, params.n1, params.direction, reducedMotion]);

  // 6. Smooth GSAP Exploded View Transition
  useEffect(() => {
    const targetExplode = viewMode === 'exploded' ? explodeFactor : 0;
    gsap.to(animatedExplodeRef.current, {
      value: targetExplode,
      duration: reducedMotion ? 0.05 : 0.75,
      ease: 'power3.out',
    });
  }, [viewMode, explodeFactor, reducedMotion]);

  // 7. Smooth GSAP Camera Preset Transitions
  useEffect(() => {
    if (!cameraRef.current) return;
    const span = Math.max(5.5, kinematics.centerDistance * SCENE_SCALE * 1.45);
    const halfCenterScene = (kinematics.centerDistance * SCENE_SCALE) / 2;
    const pinionX = -halfCenterScene;
    const r1Scene = (kinematics.pitchDiameter1 * SCENE_SCALE) / 2;

    const presets: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
      isometric: { pos: [0, span * 0.65, span * 1.35], target: [0, -0.2, 0] },
      front: { pos: [0, 0.1, span * 1.55], target: [0, 0, 0] },
      top: { pos: [0, span * 1.75, 0.01], target: [0, 0, 0] },
      mesh_closeup: {
        pos: [pinionX + r1Scene, 0.35, Math.max(2.2, params.module * 0.75)],
        target: [pinionX + r1Scene, 0, 0],
      },
      exploded_view: { pos: [span * 0.95, span * 0.65, span * 1.3], target: [0, -0.2, 0] },
    };

    const chosen = presets[cameraPreset] || presets.isometric;
    const dur = reducedMotion ? 0.05 : 0.9;

    gsap.to(cameraRef.current.position, {
      x: chosen.pos[0],
      y: chosen.pos[1],
      z: chosen.pos[2],
      duration: dur,
      ease: 'power3.inOut',
    });

    gsap.to(orbitTargetRef.current, {
      x: chosen.target[0],
      y: chosen.target[1],
      z: chosen.target[2],
      duration: dur,
      ease: 'power3.inOut',
    });
  }, [cameraPreset, kinematics.centerDistance, kinematics.pitchDiameter1, params.module, reducedMotion]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Native Three.js WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 3D-to-2D Projected Spatial Callout Annotations */}
      {showAnnotations && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
          {labelCoords.pinion.visible && (
            <button
              onClick={() => onSelectComponent('pinion')}
              style={{
                transform: `translate3d(${labelCoords.pinion.x}px, ${labelCoords.pinion.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`pointer-events-auto absolute top-0 left-0 px-2 py-1 text-[10px] font-mono tracking-wider uppercase border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedComponent === 'pinion'
                  ? 'bg-[#FF9F43] text-[#080A0E] border-[#FF9F43] font-bold'
                  : 'bg-[#080A0E]/90 text-[#F3F5F7] border-[#2B3440] hover:border-[#FF9F43]'
              }`}
            >
              <span className="w-1.5 h-1.5 bg-[#FF9F43] inline-block" />
              G₁ PINION ({params.n1}T | Ø{kinematics.pitchDiameter1.toFixed(0)}mm)
            </button>
          )}

          {labelCoords.gear.visible && (
            <button
              onClick={() => onSelectComponent('gear')}
              style={{
                transform: `translate3d(${labelCoords.gear.x}px, ${labelCoords.gear.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`pointer-events-auto absolute top-0 left-0 px-2 py-1 text-[10px] font-mono tracking-wider uppercase border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedComponent === 'gear'
                  ? 'bg-[#FF9F43] text-[#080A0E] border-[#FF9F43] font-bold'
                  : 'bg-[#080A0E]/90 text-[#F3F5F7] border-[#2B3440] hover:border-[#FF9F43]'
              }`}
            >
              <span className="w-1.5 h-1.5 bg-[#56D6A0] inline-block" />
              G₂ WHEEL ({params.n2}T | Ø{kinematics.pitchDiameter2.toFixed(0)}mm)
            </button>
          )}

          {showPitchVectors && labelCoords.pitch.visible && (
            <div
              style={{
                transform: `translate3d(${labelCoords.pitch.x}px, ${labelCoords.pitch.y}px, 0) translate(-50%, 0%)`,
              }}
              className="absolute top-0 left-0 px-1.5 py-0.5 text-[9px] font-mono bg-[#151B23]/95 text-[#FF9F43] border border-[#FF9F43]/60 whitespace-nowrap"
            >
              PITCH PT P // α={params.pressureAngleDeg}°
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 7. MAIN APPLICATION COMPONENT (GEAR LAB)
// ============================================================================

export default function Home() {
  // Parametric Engineering State
  const [params, setParams] = useState<GearSystemParams>({
    n1: 18,
    n2: 36,
    module: 3.0,
    pressureAngleDeg: 20,
    rpm1: 600,
    torqueIn: 120,
    direction: 1,
    efficiency: 0.985,
  });

  // Viewport & UI Controls State
  const [viewMode, setViewMode] = useState<ViewMode>('rendered');
  const [explodeFactor, setExplodeFactor] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [showPitchVectors, setShowPitchVectors] = useState<boolean>(true);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [selectedComponent, setSelectedComponent] = useState<ComponentId | null>('pinion');
  const [isolatedComponent, setIsolatedComponent] = useState<ComponentId | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('parametric');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [stepTrigger, setStepTrigger] = useState<number>(0);
  const [activeChallengeIdx, setActiveChallengeIdx] = useState<number>(0);

  // Live Telemetry Readout State (polled at 10Hz from ref so Three.js runs at 60Hz undisturbed)
  const telemetryRef = useRef({ theta1Deg: 0, theta2Deg: 0, fps: 60 });
  const [liveTelemetry, setLiveTelemetry] = useState({ theta1Deg: 0, theta2Deg: 0, fps: 60 });

  // Inject Google Fonts (Space Grotesk, Inter, JetBrains Mono)
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  // Poll telemetryRef at 120ms intervals for status bar angle readouts
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveTelemetry({ ...telemetryRef.current });
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // Keyboard Accessibility Shortcuts (Space = Play/Pause, R = Reset Phase, W = Wireframe, E = Explode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        setResetTrigger((prev) => prev + 1);
      } else if (e.key === 'w' || e.key === 'W') {
        setViewMode((prev) => (prev === 'wireframe' ? 'rendered' : 'wireframe'));
      } else if (e.key === 'e' || e.key === 'E') {
        setViewMode((prev) => (prev === 'exploded' ? 'rendered' : 'exploded'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pure Kinematics Calculation
  const kinematics = useMemo(() => calculateGearKinematics(params), [params]);

  // Challenge Verification
  const challengeStatuses = useMemo(() => {
    return ENGINEERING_CHALLENGES.map((ch) => ch.validate(params, kinematics));
  }, [params, kinematics]);

  const handleSelectComponent = useCallback((id: ComponentId | null) => {
    setSelectedComponent(id);
    if (id) {
      setActiveTab((prev) => (prev === 'architecture' ? 'inspector' : prev));
    }
  }, []);

  const applyQuickPreset = (n1: number, n2: number, module: number, rpm1: number, torqueIn: number) => {
    setParams((prev) => ({ ...prev, n1, n2, module, rpm1, torqueIn }));
  };

  const currentComponentMeta = selectedComponent ? COMPONENT_CATALOG[selectedComponent] : COMPONENT_CATALOG.pinion;

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col select-none bg-[#080A0E] text-[#F3F5F7]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* =====================================================================
          1. COMPACT TOP NAVIGATION BAR
         ===================================================================== */}
      <header className="h-12 bg-[#10141B] border-b border-[#2B3440] px-4 flex items-center justify-between z-30 shrink-0">
        {/* Left: Brand Identity & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#FF9F43] text-[#080A0E] flex items-center justify-center font-bold text-xs font-mono">
              GL
            </div>
            <div>
              <span
                className="text-sm font-bold tracking-wider uppercase text-[#F3F5F7]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                GEAR LAB
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono text-[#687484] border border-[#2B3440] px-1.5 py-0.5 bg-[#080A0E]">
                SYS.ENG // REV 4.2
              </span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-[#2B3440] hidden md:block" />

          {/* Main Mode Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { id: 'parametric', label: 'PARAMETRIC LAB', icon: Sliders },
              { id: 'inspector', label: 'PART INSPECTOR', icon: Cpu },
              { id: 'academy', label: 'ACADEMY & CHALLENGES', icon: Award },
              // { id: 'architecture', label: 'NEXT.JS ARCHITECTURE', icon: Code },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`px-3 py-1.5 text-[11px] font-mono tracking-wide uppercase flex items-center gap-1.5 border transition-colors ${
                    active
                      ? 'bg-[#151B23] text-[#FF9F43] border-[#FF9F43]'
                      : 'bg-transparent text-[#A0AAB7] border-transparent hover:text-[#F3F5F7] hover:border-[#2B3440]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.id === 'academy' && challengeStatuses.some((c) => c.passed) && (
                    <span className="w-1.5 h-1.5 bg-[#56D6A0]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Camera Presets & Global Toggles */}
        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center bg-[#080A0E] border border-[#2B3440] p-0.5">
            {(
              [
                { id: 'isometric', label: 'ISO' },
                { id: 'front', label: 'FRONT' },
                { id: 'top', label: 'AXIAL' },
                { id: 'mesh_closeup', label: 'PITCH MESH' },
                { id: 'exploded_view', label: 'OVERVIEW' },
              ] as { id: CameraPreset; label: string }[]
            ).map((cam) => (
              <button
                key={cam.id}
                onClick={() => setCameraPreset(cam.id)}
                className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${
                  cameraPreset === cam.id
                    ? 'bg-[#FF9F43] text-[#080A0E] font-semibold'
                    : 'text-[#A0AAB7] hover:text-[#F3F5F7]'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAnnotations((p) => !p)}
            title="Toggle 3D Spatial Callout Labels"
            className={`px-2.5 py-1 text-[10px] font-mono uppercase border transition-colors flex items-center gap-1 ${
              showAnnotations
                ? 'bg-[#151B23] text-[#FF9F43] border-[#FF9F43]/60'
                : 'bg-[#080A0E] text-[#687484] border-[#2B3440]'
            }`}
          >
            <Crosshair className="w-3 h-3" />
            <span className="hidden sm:inline">LABELS</span>
          </button>

          <button
            onClick={() => setReducedMotion((p) => !p)}
            title="Toggle Reduced Motion Accessibility"
            className={`px-2.5 py-1 text-[10px] font-mono uppercase border transition-colors ${
              reducedMotion
                ? 'bg-[#151B23] text-[#56D6A0] border-[#56D6A0]/60'
                : 'bg-[#080A0E] text-[#687484] border-[#2B3440]'
            }`}
          >
            {reducedMotion ? 'MOTION: MIN' : 'MOTION: FULL'}
          </button>
        </div>
      </header>

      {/* =====================================================================
          2. MAIN WORKSPACE: LEFT RAIL + 3D VIEWPORT + RIGHT CONTEXT PANEL
         ===================================================================== */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* DOMINANT CENTERED 3D VIEWPORT */}
        <div className="flex-1 relative h-full bg-[#080A0E]">
          {/* Subtle Technical Viewport Corner Reticles */}
          <div className="pointer-events-none absolute inset-3 border border-[#2B3440]/40 z-10 flex flex-col justify-between p-3">
            <div className="flex justify-between items-start">
              <div className="text-[10px] font-mono text-[#687484] bg-[#080A0E]/80 px-2 py-1 border border-[#2B3440]">
                VIEWPORT // DIN-867 INVOLUTE SPUR PAIR (α = {params.pressureAngleDeg}°)
              </div>
              <div className="text-[10px] font-mono text-[#A0AAB7] bg-[#080A0E]/80 px-2 py-1 border border-[#2B3440] flex items-center gap-2">
                <span className="text-[#FF9F43] font-semibold">{kinematics.classification}</span>
                <span>|</span>
                <span>i = {kinematics.ratio.toFixed(2)} : 1</span>
              </div>
            </div>
          </div>

          {/* Native Three.js 3D Viewport */}
          <GearAssemblyViewport
            params={params}
            kinematics={kinematics}
            viewMode={viewMode}
            explodeFactor={explodeFactor}
            isPlaying={isPlaying}
            simSpeed={simSpeed}
            showPitchVectors={showPitchVectors}
            showAnnotations={showAnnotations}
            selectedComponent={selectedComponent}
            isolatedComponent={isolatedComponent}
            onSelectComponent={handleSelectComponent}
            cameraPreset={cameraPreset}
            resetTrigger={resetTrigger}
            stepTrigger={stepTrigger}
            telemetryRef={telemetryRef}
            reducedMotion={reducedMotion}
          />

          {/* FLOATING LEFT TOOL RAIL */}
          <aside className="absolute left-5 top-14 z-20 w-56 bg-[#151B23]/95 border border-[#2B3440] p-3 flex flex-col gap-3 shadow-2xl">
            {/* Render & Assembly Mode Selector */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#687484] mb-1.5 flex items-center justify-between">
                <span>RENDER & CAD MODE</span>
                <span className="text-[#FF9F43]">[W / E]</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {(
                  [
                    { id: 'rendered', label: 'PBR Brushed Alloy', icon: Box },
                    { id: 'wireframe', label: 'Technical Wireframe', icon: Cpu },
                    { id: 'exploded', label: 'Exploded Assembly', icon: Layers },
                  ] as { id: ViewMode; label: string; icon: any }[]
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = viewMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setViewMode(mode.id);
                        if (mode.id === 'exploded') setCameraPreset('exploded_view');
                      }}
                      className={`px-2.5 py-1.5 text-xs font-mono flex items-center justify-between border transition-colors ${
                        active
                          ? 'bg-[#FF9F43] text-[#080A0E] border-[#FF9F43] font-semibold'
                          : 'bg-[#10141B] text-[#A0AAB7] border-[#2B3440] hover:border-[#687484] hover:text-[#F3F5F7]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        {mode.label}
                      </span>
                      {active && <span className="text-[9px]">ACTIVE</span>}
                    </button>
                  );
                })}
              </div>

              {/* Explode Distance Fine Slider */}
              {viewMode === 'exploded' && (
                <div className="mt-2 pt-2 border-t border-[#2B3440]">
                  <div className="flex justify-between text-[10px] font-mono text-[#A0AAB7] mb-1">
                    <span>AXIAL SEPARATION</span>
                    <span className="text-[#FF9F43]">{(explodeFactor * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={1.6}
                    step={0.05}
                    value={explodeFactor}
                    onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
                    className="w-full accent-[#FF9F43] h-1 bg-[#080A0E] cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Pitch Circle & Action Vector Toggle */}
            <div className="pt-2 border-t border-[#2B3440]">
              <button
                onClick={() => setShowPitchVectors((p) => !p)}
                className={`w-full px-2.5 py-1.5 text-xs font-mono flex items-center justify-between border transition-colors ${
                  showPitchVectors
                    ? 'bg-[#10141B] text-[#56D6A0] border-[#56D6A0]'
                    : 'bg-[#10141B] text-[#687484] border-[#2B3440]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5" />
                  Pitch & Action Vectors
                </span>
                <span className="text-[9px]">{showPitchVectors ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Assembly Component Tree & Isolation */}
            <div className="pt-2 border-t border-[#2B3440]">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#687484] mb-1.5">
                <span>ASSEMBLY TREE</span>
                {isolatedComponent && (
                  <button
                    onClick={() => setIsolatedComponent(null)}
                    className="text-[#FF9F43] hover:underline"
                  >
                    SHOW ALL
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {(Object.keys(COMPONENT_CATALOG) as ComponentId[]).map((compId) => {
                  const item = COMPONENT_CATALOG[compId];
                  const isSel = selectedComponent === compId;
                  const isIso = isolatedComponent === compId;
                  return (
                    <div key={compId} className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedComponent(compId);
                          setActiveTab('inspector');
                        }}
                        className={`flex-1 px-2 py-1 text-[11px] font-mono text-left truncate border transition-colors ${
                          isSel
                            ? 'bg-[#10141B] text-[#FF9F43] border-[#FF9F43]'
                            : 'bg-[#10141B]/60 text-[#A0AAB7] border-[#2B3440] hover:text-[#F3F5F7]'
                        }`}
                      >
                        {item.name.split(' (')[0]}
                      </button>
                      <button
                        onClick={() => setIsolatedComponent(isIso ? null : compId)}
                        title={isIso ? 'Restore Full Assembly' : 'Isolate Component'}
                        className={`px-1.5 py-1 text-[10px] font-mono border transition-colors ${
                          isIso
                            ? 'bg-[#FF9F43] text-[#080A0E] border-[#FF9F43] font-bold'
                            : 'bg-[#10141B] text-[#687484] border-[#2B3440] hover:text-[#F3F5F7]'
                        }`}
                      >
                        <Focus className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* BOTTOM FLOATING PLAYBACK CONTROLS */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-[#151B23]/95 border border-[#2B3440] px-3 py-2 flex items-center gap-3 shadow-2xl">
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="px-3 py-1.5 bg-[#FF9F43] hover:bg-[#FFB866] text-[#080A0E] font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'PAUSE' : 'DRIVE'}
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setStepTrigger((s) => s + 1);
              }}
              title="Index Drive Pinion by Exactly 1 Circular Pitch (2π/N₁)"
              className="px-2.5 py-1.5 bg-[#10141B] hover:border-[#FF9F43] text-[#F3F5F7] border border-[#2B3440] font-mono text-xs flex items-center gap-1 transition-colors"
            >
              <StepForward className="w-3.5 h-3.5 text-[#FF9F43]" />
              <span>STEP 1T</span>
            </button>

            <button
              onClick={() => setParams((p) => ({ ...p, direction: p.direction === 1 ? -1 : 1 }))}
              className="px-2.5 py-1.5 bg-[#10141B] hover:border-[#FF9F43] text-[#F3F5F7] border border-[#2B3440] font-mono text-xs flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#FF9F43]" />
              <span>{params.direction === 1 ? 'CCW INPUT' : 'CW INPUT'}</span>
            </button>

            <button
              onClick={() => setResetTrigger((r) => r + 1)}
              title="Reset Angular Phase Alignment (Key: R)"
              className="p-1.5 bg-[#10141B] hover:border-[#FF9F43] text-[#A0AAB7] hover:text-[#F3F5F7] border border-[#2B3440] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-[1px] bg-[#2B3440]" />

            {/* Simulation Speed Multiplier */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-[#687484] mr-1 hidden sm:inline">TIME:</span>
              {[0.1, 0.25, 0.5, 1.0, 2.0].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd)}
                  className={`px-1.5 py-1 text-[10px] font-mono border transition-colors ${
                    simSpeed === spd
                      ? 'bg-[#10141B] text-[#FF9F43] border-[#FF9F43] font-semibold'
                      : 'bg-transparent text-[#687484] border-transparent hover:text-[#F3F5F7]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* =====================================================================
            3. RIGHT CONTEXTUAL ENGINEERING PANEL
           ===================================================================== */}
        <aside className="w-full sm:w-[410px] bg-[#151B23] border-l border-[#2B3440] flex flex-col h-full z-20 shrink-0">
          {/* Mobile Tab Switcher */}
          <div className="flex md:hidden border-b border-[#2B3440] bg-[#10141B]">
            {(
              [
                { id: 'parametric', label: 'PARAMS' },
                { id: 'inspector', label: 'PART' },
                { id: 'academy', label: 'ACADEMY' },
                { id: 'architecture', label: 'CODE' },
              ] as { id: ActiveTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-2 text-[10px] font-mono uppercase border-b-2 ${
                  activeTab === t.id
                    ? 'border-[#FF9F43] text-[#FF9F43] bg-[#151B23]'
                    : 'border-transparent text-[#687484]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable Panel Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* -----------------------------------------------------------------
                TAB A: PARAMETRIC CONTROLS & LIVE TELEMETRY
               ----------------------------------------------------------------- */}
            {activeTab === 'parametric' && (
              <>
                {/* Section Header */}
                <div className="border-b border-[#2B3440] pb-2.5 flex items-center justify-between">
                  <div>
                    <h2
                      className="text-sm font-bold uppercase tracking-wider text-[#F3F5F7]"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      KINEMATIC & GEOMETRY SYNTHESIS
                    </h2>
                    <p className="text-xs text-[#687484]">
                      Real-time involute profile regeneration & torque telemetry
                    </p>
                  </div>
                  <Activity className="w-4 h-4 text-[#FF9F43]" />
                </div>

                {/* Quick Engineering Stage Presets */}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#687484] block mb-1.5">
                    STANDARD TRANSMISSION PRESETS
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => applyQuickPreset(16, 48, 2.5, 1200, 150)}
                      className="px-2 py-1.5 bg-[#10141B] hover:border-[#FF9F43] border border-[#2B3440] text-left transition-colors"
                    >
                      <div className="text-[11px] font-mono font-bold text-[#F3F5F7]">3.00:1 REDUCER</div>
                      <div className="text-[9px] font-mono text-[#687484]">16T → 48T | m=2.5</div>
                    </button>
                    <button
                      onClick={() => applyQuickPreset(24, 24, 3.0, 900, 100)}
                      className="px-2 py-1.5 bg-[#10141B] hover:border-[#FF9F43] border border-[#2B3440] text-left transition-colors"
                    >
                      <div className="text-[11px] font-mono font-bold text-[#F3F5F7]">1.00:1 SYNC</div>
                      <div className="text-[9px] font-mono text-[#687484]">24T → 24T | m=3.0</div>
                    </button>
                    <button
                      onClick={() => applyQuickPreset(32, 16, 2.5, 600, 80)}
                      className="px-2 py-1.5 bg-[#10141B] hover:border-[#FF9F43] border border-[#2B3440] text-left transition-colors"
                    >
                      <div className="text-[11px] font-mono font-bold text-[#F3F5F7]">0.50:1 OVERDRIVE</div>
                      <div className="text-[9px] font-mono text-[#687484]">32T → 16T | m=2.5</div>
                    </button>
                  </div>
                </div>

                {/* Parametric Sliders */}
                <div className="space-y-3.5 bg-[#10141B] p-3.5 border border-[#2B3440]">
                  {/* Drive Pinion Teeth N1 */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A0AAB7]">DRIVE PINION TEETH (N₁)</span>
                      <span className="text-[#FF9F43] font-bold">{params.n1} TEETH</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={36}
                      step={1}
                      value={params.n1}
                      onChange={(e) => setParams((p) => ({ ...p, n1: parseInt(e.target.value, 10) }))}
                      className="w-full accent-[#FF9F43] h-1.5 bg-[#080A0E] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#687484] mt-0.5">
                      <span>12T (Min Undercut Limit)</span>
                      <span>Pitch Ø: {kinematics.pitchDiameter1.toFixed(1)} mm</span>
                    </div>
                  </div>

                  {/* Driven Gear Teeth N2 */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A0AAB7]">DRIVEN GEAR TEETH (N₂)</span>
                      <span className="text-[#56D6A0] font-bold">{params.n2} TEETH</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={64}
                      step={1}
                      value={params.n2}
                      onChange={(e) => setParams((p) => ({ ...p, n2: parseInt(e.target.value, 10) }))}
                      className="w-full accent-[#56D6A0] h-1.5 bg-[#080A0E] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#687484] mt-0.5">
                      <span>12T</span>
                      <span>Pitch Ø: {kinematics.pitchDiameter2.toFixed(1)} mm</span>
                    </div>
                  </div>

                  {/* Metric Module (m) */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A0AAB7]">METRIC MODULE (m)</span>
                      <span className="text-[#F3F5F7] font-bold">{params.module.toFixed(1)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={2.0}
                      max={4.5}
                      step={0.5}
                      value={params.module}
                      onChange={(e) => setParams((p) => ({ ...p, module: parseFloat(e.target.value) }))}
                      className="w-full accent-[#FF9F43] h-1.5 bg-[#080A0E] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#687484] mt-0.5">
                      <span>ISO 54 Standard</span>
                      <span>Circular Pitch p: {kinematics.circularPitch.toFixed(2)} mm</span>
                    </div>
                  </div>

                  {/* Input Speed RPM1 */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A0AAB7]">INPUT ANGULAR SPEED (RPM₁)</span>
                      <span className="text-[#FF9F43] font-bold">
                        {params.rpm1} RPM ({params.direction === 1 ? 'CCW' : 'CW'})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3000}
                      step={25}
                      value={params.rpm1}
                      onChange={(e) => setParams((p) => ({ ...p, rpm1: parseInt(e.target.value, 10) }))}
                      className="w-full accent-[#FF9F43] h-1.5 bg-[#080A0E] cursor-pointer"
                    />
                  </div>

                  {/* Input Torque */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-[#A0AAB7]">INPUT SHAFT TORQUE (τ_in)</span>
                      <span className="text-[#F3F5F7] font-bold">{params.torqueIn} Nm</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={500}
                      step={5}
                      value={params.torqueIn}
                      onChange={(e) => setParams((p) => ({ ...p, torqueIn: parseInt(e.target.value, 10) }))}
                      className="w-full accent-[#FF9F43] h-1.5 bg-[#080A0E] cursor-pointer"
                    />
                  </div>
                </div>

                {/* Live Engineering Telemetry Readout Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#687484]">
                      REAL-TIME KINEMATIC TELEMETRY
                    </span>
                    <span className="text-[10px] font-mono text-[#56D6A0]">η = 98.5% MESH EFF</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#10141B] border border-[#2B3440] p-2.5">
                      <div className="text-[10px] font-mono text-[#687484]">TRANSMISSION RATIO (i)</div>
                      <div className="text-lg font-mono font-bold text-[#FF9F43] mt-0.5">
                        {kinematics.ratio.toFixed(3)} : 1
                      </div>
                      <div className="text-[10px] font-mono text-[#A0AAB7] mt-0.5">
                        {kinematics.classification}
                      </div>
                    </div>

                    <div className="bg-[#10141B] border border-[#2B3440] p-2.5">
                      <div className="text-[10px] font-mono text-[#687484]">OUTPUT SPEED (RPM₂)</div>
                      <div className="text-lg font-mono font-bold text-[#56D6A0] mt-0.5">
                        {Math.abs(kinematics.rpm2).toFixed(1)} RPM
                      </div>
                      <div className="text-[10px] font-mono text-[#A0AAB7] mt-0.5">
                        Dir: {kinematics.rpm2 < 0 ? 'CW (Opposing)' : kinematics.rpm2 > 0 ? 'CCW (Opposing)' : 'Static'}
                      </div>
                    </div>

                    <div className="bg-[#10141B] border border-[#2B3440] p-2.5">
                      <div className="text-[10px] font-mono text-[#687484]">OUTPUT TORQUE (τ_out)</div>
                      <div className="text-lg font-mono font-bold text-[#F3F5F7] mt-0.5">
                        {kinematics.torqueOut.toFixed(1)} Nm
                      </div>
                      <div className="text-[10px] font-mono text-[#687484] mt-0.5">
                        Power: {kinematics.powerKw.toFixed(2)} kW
                      </div>
                    </div>

                    <div className="bg-[#10141B] border border-[#2B3440] p-2.5">
                      <div className="text-[10px] font-mono text-[#687484]">CENTER DISTANCE (C)</div>
                      <div className="text-lg font-mono font-bold text-[#F3F5F7] mt-0.5">
                        {kinematics.centerDistance.toFixed(2)} mm
                      </div>
                      <div className="text-[10px] font-mono text-[#687484] mt-0.5">
                        v_p: {kinematics.pitchLineVelocity.toFixed(2)} m/s
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tooth Mesh Load & Contact Quality Bar */}
                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#A0AAB7]">TRANSVERSE CONTACT RATIO (ε_α)</span>
                    <span
                      className={`font-bold ${
                        kinematics.contactRatio >= 1.4 ? 'text-[#56D6A0]' : 'text-[#FF6B6B]'
                      }`}
                    >
                      {kinematics.contactRatio.toFixed(3)} {kinematics.contactRatio >= 1.4 ? '(OPTIMAL > 1.4)' : '(LOW)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#2B3440] text-[11px] font-mono">
                    <div>
                      <span className="text-[#687484] block">TANGENTIAL LOAD (F_t)</span>
                      <span className="text-[#F3F5F7] font-semibold">{kinematics.tangentialForce.toFixed(0)} N</span>
                    </div>
                    <div>
                      <span className="text-[#687484] block">RADIAL SEPARATING (F_r)</span>
                      <span className="text-[#F3F5F7] font-semibold">{kinematics.radialForce.toFixed(0)} N</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* -----------------------------------------------------------------
                TAB B: SELECTED 3D COMPONENT METALLURGICAL INSPECTOR
               ----------------------------------------------------------------- */}
            {activeTab === 'inspector' && (
              <div className="space-y-4">
                <div className="border-b border-[#2B3440] pb-2.5">
                  <div className="text-[10px] font-mono text-[#FF9F43] uppercase">
                    {currentComponentMeta.code}
                  </div>
                  <h2
                    className="text-base font-bold text-[#F3F5F7] mt-0.5"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {currentComponentMeta.name}
                  </h2>
                </div>

                {/* Component Selector Pills */}
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(COMPONENT_CATALOG) as ComponentId[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => setSelectedComponent(id)}
                      className={`px-2 py-1.5 text-[10px] font-mono uppercase border transition-colors ${
                        selectedComponent === id
                          ? 'bg-[#FF9F43] text-[#080A0E] border-[#FF9F43] font-bold'
                          : 'bg-[#10141B] text-[#A0AAB7] border-[#2B3440] hover:text-[#F3F5F7]'
                      }`}
                    >
                      {id.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Metallurgical & Metrology Specs */}
                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2.5 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-[#687484] block">ALLOY SPECIFICATION</span>
                    <span className="text-[#F3F5F7]">{currentComponentMeta.material}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2B3440]">
                    <div>
                      <span className="text-[10px] text-[#687484] block">SURFACE HARDNESS</span>
                      <span className="text-[#FF9F43]">{currentComponentMeta.hardness}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#687484] block">ESTIMATED MASS</span>
                      <span className="text-[#56D6A0]">{currentComponentMeta.massKg.toFixed(2)} kg</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#2B3440]">
                    <span className="text-[10px] text-[#687484] block">SURFACE METROLOGY</span>
                    <span className="text-[#A0AAB7]">{currentComponentMeta.surfaceFinish}</span>
                  </div>
                </div>

                {/* Dynamic Dimensional Readout for Gears */}
                {(selectedComponent === 'pinion' || selectedComponent === 'gear') && (
                  <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2">
                    <div className="text-[10px] font-mono uppercase text-[#FF9F43]">
                      LIVE INVOLUTE DIMENSIONAL TABLE ({selectedComponent === 'pinion' ? 'G₁ PINION' : 'G₂ WHEEL'})
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-[#687484] block">PITCH DIAMETER (d)</span>
                        <span>
                          {(selectedComponent === 'pinion'
                            ? kinematics.pitchDiameter1
                            : kinematics.pitchDiameter2
                          ).toFixed(2)}{' '}
                          mm
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#687484] block">OUTER TIP Ø (d_a)</span>
                        <span>
                          {(selectedComponent === 'pinion'
                            ? kinematics.outerDiameter1
                            : kinematics.outerDiameter2
                          ).toFixed(2)}{' '}
                          mm
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#687484] block">BASE CIRCLE Ø (d_b)</span>
                        <span>
                          {(selectedComponent === 'pinion'
                            ? kinematics.baseDiameter1
                            : kinematics.baseDiameter2
                          ).toFixed(2)}{' '}
                          mm
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#687484] block">ROOT CIRCLE Ø (d_f)</span>
                        <span>
                          {(selectedComponent === 'pinion'
                            ? kinematics.rootDiameter1
                            : kinematics.rootDiameter2
                          ).toFixed(2)}{' '}
                          mm
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Engineering Function & Design Notes */}
                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2 text-xs">
                  <div className="text-[10px] font-mono uppercase text-[#687484]">FUNCTIONAL ANALYSIS</div>
                  <p className="text-[#A0AAB7] leading-relaxed">{currentComponentMeta.description}</p>
                  <div className="pt-2 border-t border-[#2B3440]">
                    <span className="text-[10px] font-mono uppercase text-[#FF9F43] block mb-1">
                      STRESS & TRIBOLOGY NOTE
                    </span>
                    <p className="text-[#A0AAB7] leading-relaxed">{currentComponentMeta.engineeringNotes}</p>
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                TAB C: EDUCATIONAL ACADEMY, ANATOMY & DESIGN CHALLENGES
               ----------------------------------------------------------------- */}
            {activeTab === 'academy' && (
              <div className="space-y-4">
                <div className="border-b border-[#2B3440] pb-2.5">
                  <h2
                    className="text-sm font-bold uppercase tracking-wider text-[#F3F5F7]"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    ENGINEERING DESIGN CHALLENGES & FORMULAS
                  </h2>
                  <p className="text-xs text-[#687484]">
                    Validate transmission synthesis against industrial constraints
                  </p>
                </div>

                {/* Interactive 3-Stage Challenge Selector */}
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {ENGINEERING_CHALLENGES.map((ch, idx) => {
                      const status = challengeStatuses[idx];
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setActiveChallengeIdx(idx)}
                          className={`flex-1 py-1.5 px-2 text-[10px] font-mono border flex items-center justify-center gap-1 transition-colors ${
                            activeChallengeIdx === idx
                              ? 'bg-[#10141B] text-[#FF9F43] border-[#FF9F43] font-bold'
                              : 'bg-[#10141B]/50 text-[#A0AAB7] border-[#2B3440]'
                          }`}
                        >
                          <span>STAGE 0{ch.id}</span>
                          {status.passed && <CheckCircle2 className="w-3 h-3 text-[#56D6A0]" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Challenge Card */}
                  {(() => {
                    const ch = ENGINEERING_CHALLENGES[activeChallengeIdx];
                    const status = challengeStatuses[activeChallengeIdx];
                    return (
                      <div
                        className={`p-3.5 border transition-colors ${
                          status.passed
                            ? 'bg-[#10141B] border-[#56D6A0]'
                            : 'bg-[#10141B] border-[#2B3440]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono text-[#FF9F43]">{ch.code}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${
                              status.passed
                                ? 'bg-[#56D6A0] text-[#080A0E]'
                                : 'bg-[#2B3440] text-[#A0AAB7]'
                            }`}
                          >
                            {status.passed ? 'VERIFIED PASS' : 'IN PROGRESS'}
                          </span>
                        </div>
                        <h3 className="text-xs font-bold text-[#F3F5F7] mb-1">{ch.title}</h3>
                        <p className="text-xs text-[#A0AAB7] leading-relaxed mb-2.5">{ch.objective}</p>

                        <div className="space-y-1 mb-2.5">
                          {ch.constraints.map((c, i) => (
                            <div key={i} className="text-[11px] font-mono text-[#F3F5F7] flex items-center gap-1.5">
                              <ChevronRight className="w-3 h-3 text-[#FF9F43]" />
                              {c}
                            </div>
                          ))}
                        </div>

                        <div className="p-2 bg-[#080A0E] border border-[#2B3440] text-[10px] font-mono text-[#A0AAB7] mb-2">
                          {status.progressText}
                        </div>

                        <div className="text-[11px] text-[#687484] italic">
                          <strong className="text-[#A0AAB7] not-italic">Hint: </strong>
                          {ch.hint}
                        </div>

                        <button
                          onClick={() => setActiveTab('parametric')}
                          className="mt-2.5 w-full py-1.5 bg-[#151B23] hover:border-[#FF9F43] text-[#FF9F43] border border-[#2B3440] text-[10px] font-mono uppercase transition-colors"
                        >
                          OPEN PARAMETRIC SLIDERS TO SOLVE →
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Live Substituted Formula Sheet */}
                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2.5">
                  <div className="text-[10px] font-mono uppercase text-[#FF9F43]">
                    FUNDAMENTAL GEAR KINEMATICS (LIVE SUBSTITUTION)
                  </div>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="p-2 bg-[#080A0E] border border-[#2B3440]">
                      <div className="text-[#687484] text-[10px]">1. FUNDAMENTAL LAW OF GEARING RATIO</div>
                      <div className="text-[#F3F5F7] mt-0.5">
                        i = N₂ / N₁ = {params.n2} / {params.n1} ={' '}
                        <span className="text-[#FF9F43] font-bold">{kinematics.ratio.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#080A0E] border border-[#2B3440]">
                      <div className="text-[#687484] text-[10px]">2. STANDARD SHAFT CENTER DISTANCE</div>
                      <div className="text-[#F3F5F7] mt-0.5">
                        C = m·(N₁ + N₂)/2 = {params.module}·({params.n1}+{params.n2})/2 ={' '}
                        <span className="text-[#56D6A0] font-bold">{kinematics.centerDistance.toFixed(1)} mm</span>
                      </div>
                    </div>
                    <div className="p-2 bg-[#080A0E] border border-[#2B3440]">
                      <div className="text-[#687484] text-[10px]">3. CONJUGATE OUTPUT SPEED & TORQUE</div>
                      <div className="text-[#F3F5F7] mt-0.5">
                        ω₂ = -ω₁ / i = {kinematics.rpm2.toFixed(1)} RPM | τ_out = τ_in·i·η ={' '}
                        <span className="text-[#FF9F43] font-bold">{kinematics.torqueOut.toFixed(1)} Nm</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gear Tooth Anatomy Glossary */}
                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2 text-xs">
                  <div className="text-[10px] font-mono uppercase text-[#687484]">
                    INVOLUTE TOOTH ANATOMY REFERENCE
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div>
                      <span className="text-[#FF9F43] font-mono font-semibold">Pitch Circle (d = m·N): </span>
                      <span className="text-[#A0AAB7]">
                        Imaginary tangent circles that roll without slipping at the Pitch Point (P).
                      </span>
                    </div>
                    <div>
                      <span className="text-[#56D6A0] font-mono font-semibold">Pressure Angle (α = 20°): </span>
                      <span className="text-[#A0AAB7]">
                        Angle between the Line of Action and the common tangent to the pitch circles.
                      </span>
                    </div>
                    <div>
                      <span className="text-[#F3F5F7] font-mono font-semibold">Addendum (h_a = 1.0m) & Dedendum (h_f = 1.25m): </span>
                      <span className="text-[#A0AAB7]">
                        Radial tooth height above and below the pitch circle, providing 0.25m root clearance.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* -----------------------------------------------------------------
                TAB D: NEXT.JS APP ROUTER ARCHITECTURE & SETUP NOTES
               ----------------------------------------------------------------- */}
            {activeTab === 'architecture' && (
              <div className="space-y-4">
                <div className="border-b border-[#2B3440] pb-2.5">
                  <h2
                    className="text-sm font-bold uppercase tracking-wider text-[#F3F5F7]"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    NEXT.JS APP ROUTER & 3D ARCHITECTURE
                  </h2>
                  <p className="text-xs text-[#687484]">
                    Production modular structure & performance engineering notes
                  </p>
                </div>

                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2 text-xs font-mono">
                  <div className="text-[10px] text-[#FF9F43] uppercase">
                    RECOMMENDED NEXT.JS 14/15 DIRECTORY TREE
                  </div>
                  <pre className="text-[11px] text-[#A0AAB7] overflow-x-auto leading-relaxed">
{`src/
├── app/
│   ├── layout.tsx          # Space Grotesk, Inter, JetBrains Mono
│   ├── page.tsx            # Server entry + dynamic('GearLabClient')
│   └── globals.css         # Tailwind & #080A0E industrial tokens
├── components/
│   ├── canvas/
│   │   ├── GearCanvas.tsx  # Client-only R3F <Canvas> wrapper
│   │   ├── GearAssembly.tsx# useFrame 60fps ref-driven mesh pair
│   │   └── PitchVectors.tsx# Drei <Line> & <Html> annotations
│   └── hud/
│       ├── TopNavBar.tsx
│       ├── LeftToolRail.tsx
│       ├── RightContextPanel.tsx
│       └── PlaybackBar.tsx
└── lib/
    ├── gearKinematics.ts   # Pure physics & torque engine
    └── involuteGeometry.ts # Procedural THREE.ExtrudeGeometry`}
                  </pre>
                </div>

                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-2 text-xs">
                  <div className="text-[10px] font-mono text-[#56D6A0] uppercase">
                    KEY ARCHITECTURAL GUARANTEES
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-[#A0AAB7] list-disc pl-4">
                    <li>
                      <strong className="text-[#F3F5F7]">Zero Per-Frame React Re-Renders:</strong> Angular velocities{' '}
                      <code>θ₁</code> and <code>θ₂ = -θ₁(N₁/N₂) + φ_mesh</code> are mutated directly on{' '}
                      <code>THREE.Group</code> refs inside <code>useFrame</code>.
                    </li>
                    <li>
                      <strong className="text-[#F3F5F7]">True Involute Profile Generation:</strong> Teeth are generated via parametric involute equations{' '}
                      <code>inv(φ) = tan(φ) - φ</code> with 20° pressure angle, root clearance, and keyway slots.
                    </li>
                    <li>
                      <strong className="text-[#F3F5F7]">SSR-Safe Next.js Hydration:</strong> Load the R3F canvas with{' '}
                      <code>next/dynamic(..., &#123; ssr: false &#125;)</code> to guarantee clean client WebGL initialization.
                    </li>
                  </ul>
                </div>

                <div className="bg-[#10141B] border border-[#2B3440] p-3 space-y-1.5 text-xs font-mono">
                  <div className="text-[10px] text-[#687484] uppercase">INSTALL DEPENDENCIES</div>
                  <div className="p-2 bg-[#080A0E] border border-[#2B3440] text-[10px] text-[#FF9F43] select-all">
                    npm i three @types/three @react-three/fiber @react-three/drei gsap lucide-react
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* =====================================================================
          4. COMPACT TECHNICAL STATUS BAR (FOOTER)
         ===================================================================== */}
      <footer className="h-7 bg-[#10141B] border-t border-[#2B3440] px-4 flex items-center justify-between text-[10px] font-mono text-[#687484] z-30 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#56D6A0]">
            <span className="w-1.5 h-1.5 bg-[#56D6A0] inline-block" />
            WEBGL2 // ACTIVE ({liveTelemetry.fps} FPS)
          </span>
          <span className="hidden sm:inline">
            PHASE θ₁: <strong className="text-[#F3F5F7]">{liveTelemetry.theta1Deg.toFixed(1)}°</strong>
          </span>
          <span className="hidden sm:inline">
            PHASE θ₂: <strong className="text-[#F3F5F7]">{liveTelemetry.theta2Deg.toFixed(1)}°</strong>
          </span>
          <span className="hidden md:inline">
            CENTER DIST C: <strong className="text-[#FF9F43]">{kinematics.centerDistance.toFixed(2)} mm</strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden lg:inline">
            SHORTCUTS: [SPACE] PLAY/PAUSE · [R] RESET · [W] WIREFRAME · [E] EXPLODE
          </span>
          <span className="text-[#A0AAB7]">ISO 54 / DIN 867 INVOLUTE STANDARD</span>
        </div>
      </footer>
    </div>
  );
}
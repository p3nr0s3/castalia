"use client";

import React, { useState, useEffect } from "react";
import { VoiceCallStatus } from "./VoiceCallModal";

interface RobotCompanionProps {
  status: VoiceCallStatus;
  isMuted?: boolean;
  onInterrupt?: () => void;
}

export const RobotCompanion: React.FC<RobotCompanionProps> = ({
  status,
  isMuted = false,
  onInterrupt,
}) => {
  // Blinking animation state
  const [isBlinking, setIsBlinking] = useState(false);
  // Speech mouth animation frame
  const [mouthFrame, setMouthFrame] = useState(0);
  // Thinking eye pattern frame
  const [thinkingFrame, setThinkingFrame] = useState(0);
  // Click reaction for extra expressiveness
  const [isHappyWiggle, setIsHappyWiggle] = useState(false);

  // Natural Blinking Loop (every 2.8 to 4.8 seconds)
  useEffect(() => {
    if (isMuted) return;

    let blinkTimeout: NodeJS.Timeout;
    const scheduleNextBlink = () => {
      const delay = Math.random() * 2000 + 2800; // 2.8s - 4.8s
      blinkTimeout = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleNextBlink();
        }, 150); // 150ms blink duration
      }, delay);
    };

    scheduleNextBlink();
    return () => clearTimeout(blinkTimeout);
  }, [isMuted]);

  // Speaking mouth movement loop (fluid phonemes)
  useEffect(() => {
    if (status !== "speaking") {
      setMouthFrame(0);
      return;
    }

    const interval = setInterval(() => {
      setMouthFrame((prev) => (prev + 1) % 5);
    }, 130);

    return () => clearInterval(interval);
  }, [status]);

  // Thinking animation loop
  useEffect(() => {
    if (status !== "thinking") {
      setThinkingFrame(0);
      return;
    }

    const interval = setInterval(() => {
      setThinkingFrame((prev) => (prev + 1) % 4);
    }, 280);

    return () => clearInterval(interval);
  }, [status]);

  const handleClick = () => {
    if (status === "speaking" && onInterrupt) {
      onInterrupt();
    } else {
      setIsHappyWiggle(true);
      setTimeout(() => setIsHappyWiggle(false), 700);
    }
  };

  // Pixel matrix definitions (6 columns x 6 rows per eye)
  // 1 = lit cyan LED, 0 = off
  const renderEyeMatrix = (type: "open" | "blink" | "happy" | "thinking" | "sleepy") => {
    // Normal wide open eye (rounded rectangle pixel cluster matching Image 2)
    const openEye = [
      [0, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
    ];

    // Blinking eye (thin horizontal slit)
    const blinkEye = [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];

    // Happy squint / smile arc ^ ^
    const happyEye = [
      [0, 1, 1, 1, 1, 0],
      [1, 1, 0, 0, 1, 1],
      [1, 0, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];

    // Sleepy eye (lowered eyelids)
    const sleepyEye = [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0],
    ];

    // Thinking eye frames (looking around / pondering)
    const thinkingEyes = [
      [
        [0, 0, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1],
        [0, 0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 0, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1],
        [0, 0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
    ];

    let grid = openEye;
    if (type === "blink") grid = blinkEye;
    else if (type === "happy") grid = happyEye;
    else if (type === "sleepy") grid = sleepyEye;
    else if (type === "thinking") grid = thinkingEyes[thinkingFrame % thinkingEyes.length];

    return grid.map((row, rIdx) =>
      row.map((cell, cIdx) => (
        <rect
          key={`${rIdx}-${cIdx}`}
          x={cIdx * 5.2}
          y={rIdx * 5.2}
          width="4.2"
          height="4.2"
          rx="1"
          className={`transition-opacity duration-150 ${
            cell === 1 ? "opacity-100" : "opacity-0"
          }`}
          fill="#22d3ee"
          filter="url(#cyan-glow)"
        />
      ))
    );
  };

  // Determine current eye state
  let eyeState: "open" | "blink" | "happy" | "thinking" | "sleepy" = "open";
  if (isMuted) {
    eyeState = "sleepy";
  } else if (isBlinking) {
    eyeState = "blink";
  } else if (status === "speaking" || isHappyWiggle) {
    eyeState = "happy";
  } else if (status === "thinking") {
    eyeState = "thinking";
  }

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={
        status === "speaking"
          ? "Klik robot untuk menyela AI"
          : "Robot AI Companion (Klik untuk berinteraksi)"
      }
      className={`relative flex items-center justify-center cursor-pointer select-none transition-transform duration-500 active:scale-95 ${
        isHappyWiggle ? "animate-bounce" : ""
      }`}
      style={{
        width: "min(75vw, 300px)",
        height: "min(75vw, 300px)",
      }}
    >
      {/* Outer Soundwaves / Listening Ripples */}
      {status === "listening" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="absolute w-[88%] h-[88%] rounded-full border border-cyan-400/40 animate-ping opacity-75" />
          <div className="absolute w-[108%] h-[108%] rounded-full border-2 border-cyan-400/25 animate-pulse" />
          <div className="absolute w-[124%] h-[124%] rounded-full border border-teal-400/15 animate-ping [animation-duration:2.5s]" />
        </div>
      )}

      {/* Speaking Glow Aura */}
      {status === "speaking" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="absolute w-[92%] h-[92%] rounded-full border-2 border-rose-400/40 animate-ping opacity-60" />
          <div className="absolute w-[112%] h-[112%] rounded-full border border-cyan-400/30 animate-pulse [animation-duration:1s]" />
        </div>
      )}

      {/* Thinking Aura */}
      {status === "thinking" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="absolute w-[100%] h-[100%] rounded-full border border-purple-500/30 animate-spin [animation-duration:6s]" />
          <div className="absolute w-[115%] h-[115%] rounded-full border border-t-cyan-400/40 border-r-transparent border-b-purple-400/40 border-l-transparent animate-spin [animation-duration:3s]" />
        </div>
      )}

      {/* Robot SVG Character with Dynamic SVG Filters & Gradients */}
      <svg
        viewBox="0 0 280 300"
        className={`w-full h-full drop-shadow-2xl transition-transform duration-700 ${
          status === "listening"
            ? "scale-105"
            : status === "speaking"
            ? "scale-105"
            : "scale-100"
        }`}
        style={{
          animation: isHappyWiggle
            ? "none"
            : "robot-gentle-float 4s ease-in-out infinite",
        }}
      >
        <defs>
          {/* Cyan LED Glow Filter */}
          <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Pink Blush LED Glow Filter */}
          <filter id="pink-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Ear Ring Outer Glow */}
          <filter id="ear-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 3D Shell Head Gradient (Pure White Highlight to Metallic Shadow) */}
          <radialGradient id="headGrad" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f1f5f9" />
            <stop offset="85%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </radialGradient>

          {/* Body Gradient */}
          <radialGradient id="bodyGrad" cx="42%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#e2e8f0" />
            <stop offset="90%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </radialGradient>

          {/* Dark OLED Curved Visor Glass Gradient */}
          <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#111827" />
            <stop offset="40%" stopColor="#080d1a" />
            <stop offset="100%" stopColor="#030712" />
          </linearGradient>

          {/* Curved Glass Highlight Sheen */}
          <linearGradient id="glossGrad" x1="0%" y1="0%" x2="60%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Arm / Ear Shadow */}
          <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="40%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>

        <style>{`
          @keyframes robot-gentle-float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-7px) rotate(0.6deg); }
          }
        `}</style>

        {/* ================= LOWER BODY & LIMBS ================= */}
        <g id="robot-body-group">
          {/* Cute Little Feet */}
          <ellipse cx="118" cy="265" rx="14" ry="18" fill="url(#bodyGrad)" />
          <ellipse cx="162" cy="265" rx="14" ry="18" fill="url(#bodyGrad)" />
          {/* Black Foot joints */}
          <path d="M 106 254 Q 118 259 130 254" stroke="#1e293b" strokeWidth="3" fill="none" />
          <path d="M 150 254 Q 162 259 174 254" stroke="#1e293b" strokeWidth="3" fill="none" />

          {/* Torso */}
          <path
            d="M 98 178 Q 80 200 84 235 Q 88 256 140 256 Q 192 256 196 235 Q 200 200 182 178 Z"
            fill="url(#bodyGrad)"
            filter="drop-shadow(0 4px 6px rgba(0,0,0,0.3))"
          />

          {/* Torso lower seam line */}
          <path
            d="M 88 232 Q 140 242 192 232"
            stroke="#94a3b8"
            strokeWidth="1.2"
            fill="none"
            opacity="0.7"
          />

          {/* Left Arm */}
          <g transform="rotate(-15 78 195)">
            <ellipse cx="68" cy="208" rx="11" ry="24" fill="url(#bodyGrad)" />
            {/* Shoulder dark joint */}
            <circle cx="75" cy="188" r="8" fill="#1e293b" />
          </g>

          {/* Right Arm */}
          <g transform="rotate(15 202 195)">
            <ellipse cx="212" cy="208" rx="11" ry="24" fill="url(#bodyGrad)" />
            {/* Shoulder dark joint */}
            <circle cx="205" cy="188" r="8" fill="#1e293b" />
          </g>

          {/* Chest Circular Power Core */}
          <circle cx="140" cy="204" r="8" fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
          <circle
            cx="140"
            cy="204"
            r={status === "speaking" ? 5 : status === "listening" ? 4.5 : 3.5}
            fill="#22d3ee"
            filter="url(#cyan-glow)"
            className={`transition-all duration-300 ${
              status === "speaking"
                ? "animate-ping opacity-90"
                : status === "listening"
                ? "animate-pulse"
                : "opacity-75"
            }`}
          />
          <circle cx="140" cy="204" r="2" fill="#ffffff" />
        </g>

        {/* ================= HEAD & EARS ================= */}
        <g id="robot-head-group">
          {/* Left Ear Cap & Glowing Ring */}
          <g id="left-ear">
            <ellipse cx="44" cy="98" rx="13" ry="25" fill="url(#earGrad)" />
            {/* Glowing Cyan Inner Ring */}
            <ellipse
              cx="43"
              cy="98"
              rx="8"
              ry="18"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.8"
              filter="url(#ear-glow)"
              className={status === "listening" || status === "speaking" ? "animate-pulse" : ""}
            />
            {/* Inner Ear core */}
            <ellipse cx="43" cy="98" rx="5" ry="12" fill="#0f172a" />
          </g>

          {/* Right Ear Cap & Glowing Ring */}
          <g id="right-ear">
            <ellipse cx="236" cy="98" rx="13" ry="25" fill="url(#earGrad)" />
            {/* Glowing Cyan Inner Ring */}
            <ellipse
              cx="237"
              cy="98"
              rx="8"
              ry="18"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.8"
              filter="url(#ear-glow)"
              className={status === "listening" || status === "speaking" ? "animate-pulse" : ""}
            />
            {/* Inner Ear core */}
            <ellipse cx="237" cy="98" rx="5" ry="12" fill="#0f172a" />
          </g>

          {/* Main White Head Chassis */}
          <rect
            x="48"
            y="26"
            width="184"
            height="156"
            rx="74"
            ry="70"
            fill="url(#headGrad)"
            filter="drop-shadow(0 8px 16px rgba(0,0,0,0.35))"
          />

          {/* Forehead Camera / Mic Sensor Dot */}
          <circle cx="140" cy="42" r="2.2" fill="#0f172a" />
          <circle cx="140.6" cy="41.6" r="0.7" fill="#ffffff" opacity="0.8" />

          {/* Visor Display Screen Border Bevel */}
          <rect
            x="70"
            y="54"
            width="140"
            height="104"
            rx="36"
            ry="34"
            fill="#090d16"
            stroke="#1e293b"
            strokeWidth="3.5"
            filter="drop-shadow(inset 0 2px 6px rgba(0,0,0,0.8))"
          />

          {/* Visor Screen Glass Base */}
          <rect
            x="72"
            y="56"
            width="136"
            height="100"
            rx="34"
            ry="32"
            fill="url(#screenGrad)"
          />

          {/* Subtle Visor Inner Ambient Grid Scanlines */}
          <g opacity="0.04" stroke="#ffffff" strokeWidth="0.5">
            <line x1="72" y1="68" x2="208" y2="68" />
            <line x1="72" y1="78" x2="208" y2="78" />
            <line x1="72" y1="88" x2="208" y2="88" />
            <line x1="72" y1="98" x2="208" y2="98" />
            <line x1="72" y1="108" x2="208" y2="108" />
            <line x1="72" y1="118" x2="208" y2="118" />
            <line x1="72" y1="128" x2="208" y2="128" />
            <line x1="72" y1="138" x2="208" y2="138" />
          </g>

          {/* ================= DIGITAL FACE (LED MATRIX) ================= */}

          {/* Left Eye Matrix */}
          <g transform="translate(92, 80)">
            {renderEyeMatrix(eyeState)}
          </g>

          {/* Right Eye Matrix */}
          <g transform="translate(156, 80)">
            {renderEyeMatrix(eyeState)}
          </g>

          {/* Pink LED Blush Cheeks (///) */}
          <g
            id="blush-cheeks"
            filter="url(#pink-glow)"
            className={`transition-opacity duration-500 ${
              isMuted ? "opacity-20" : status === "speaking" ? "opacity-100" : "opacity-80"
            }`}
          >
            {/* Left Blush - 4 slanted pixel dashes */}
            <g transform="translate(86, 114)">
              <rect x="0" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 0 2)" />
              <rect x="5" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 5 2)" />
              <rect x="10" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 10 2)" />
              <rect x="15" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 15 2)" />
            </g>

            {/* Right Blush - 4 slanted pixel dashes */}
            <g transform="translate(162, 114)">
              <rect x="0" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 0 2)" />
              <rect x="5" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 5 2)" />
              <rect x="10" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 10 2)" />
              <rect x="15" y="2" width="3.4" height="2" rx="0.5" fill="#fb7185" transform="rotate(-25 15 2)" />
            </g>
          </g>

          {/* Cyan Pixel Mouth */}
          <g
            id="pixel-mouth"
            filter="url(#cyan-glow)"
            className="transition-all duration-150"
          >
            {status === "speaking" ? (
              // Talking Mouth Frames (Audio Wave / Phoneme Animation)
              mouthFrame === 0 ? (
                // Open smiling 'A' shape
                <g transform="translate(126, 120)">
                  <rect x="3" y="0" width="22" height="4" rx="1.5" fill="#22d3ee" />
                  <rect x="0" y="3" width="5" height="6" rx="1" fill="#22d3ee" />
                  <rect x="23" y="3" width="5" height="6" rx="1" fill="#22d3ee" />
                  <rect x="4" y="7" width="20" height="4" rx="1.5" fill="#22d3ee" />
                </g>
              ) : mouthFrame === 1 ? (
                // Compact rounded 'O' shape
                <g transform="translate(133, 120)">
                  <rect x="2" y="0" width="10" height="3.5" rx="1" fill="#22d3ee" />
                  <rect x="0" y="2" width="3.5" height="7" rx="1" fill="#22d3ee" />
                  <rect x="10.5" y="2" width="3.5" height="7" rx="1" fill="#22d3ee" />
                  <rect x="2" y="7" width="10" height="3.5" rx="1" fill="#22d3ee" />
                </g>
              ) : mouthFrame === 2 ? (
                // Wide cheerful talking smile
                <g transform="translate(124, 120)">
                  <rect x="0" y="0" width="4" height="4" rx="1" fill="#22d3ee" />
                  <rect x="28" y="0" width="4" height="4" rx="1" fill="#22d3ee" />
                  <rect x="4" y="3.5" width="24" height="4.5" rx="1.5" fill="#22d3ee" />
                </g>
              ) : mouthFrame === 3 ? (
                // Medium open 'U' curve
                <g transform="translate(128, 121)">
                  <rect x="0" y="0" width="4" height="5" rx="1" fill="#22d3ee" />
                  <rect x="20" y="0" width="4" height="5" rx="1" fill="#22d3ee" />
                  <rect x="3" y="4.5" width="18" height="4" rx="1.5" fill="#22d3ee" />
                </g>
              ) : (
                // Expressive horizontal talk pulse
                <g transform="translate(127, 122)">
                  <rect x="0" y="0" width="26" height="4" rx="2" fill="#22d3ee" />
                </g>
              )
            ) : status === "thinking" ? (
              // Thinking mouth: small cute neutral pixel dash
              <g transform="translate(133, 122)">
                <rect x="0" y="0" width="14" height="3.5" rx="1.5" fill="#22d3ee" opacity="0.85" />
              </g>
            ) : isMuted ? (
              // Muted / Sleeping mouth: small subtle curve
              <g transform="translate(134, 122)">
                <rect x="0" y="1" width="3" height="2" rx="0.5" fill="#22d3ee" opacity="0.6" />
                <rect x="3" y="2" width="6" height="2" rx="0.5" fill="#22d3ee" opacity="0.6" />
                <rect x="9" y="1" width="3" height="2" rx="0.5" fill="#22d3ee" opacity="0.6" />
              </g>
            ) : (
              // Default Listening / Idle Happy Pixel Smile
              <g transform="translate(126, 120)">
                <rect x="0" y="0" width="4.5" height="4.5" rx="1" fill="#22d3ee" />
                <rect x="4" y="3.5" width="20" height="4.2" rx="1" fill="#22d3ee" />
                <rect x="23.5" y="0" width="4.5" height="4.5" rx="1" fill="#22d3ee" />
              </g>
            )}
          </g>

          {/* Visor Curved Glass Gloss Reflection (Highlights matching Image 2) */}
          <path
            d="M 80 62 Q 138 60 190 70 Q 140 85 86 98 Q 78 80 80 62 Z"
            fill="url(#glossGrad)"
            pointerEvents="none"
          />
        </g>
      </svg>
    </div>
  );
};

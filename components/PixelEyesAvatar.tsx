"use client";

import React, { useState, useEffect, useMemo } from "react";
import { VoiceCallStatus } from "./VoiceCallModal";

export type PixelEmotion =
  | "normal"
  | "happy"
  | "curious"
  | "thinking"
  | "surprised"
  | "focused"
  | "concerned";

interface PixelEyesAvatarProps {
  status: VoiceCallStatus;
  isMuted?: boolean;
  userQuery?: string;
  onInterrupt?: () => void;
}

// Helper to analyze the user's question and map to an expressive emotion
export function detectEmotionFromText(text: string): PixelEmotion {
  if (!text) return "normal";
  const lower = text.toLowerCase().trim();

  // Greetings, compliments, happy, casual friendly & music vibing words
  if (
    /\b(halo|hai|hey|pagi|siang|malam|sore|makasih|terima kasih|senang|suka|hebat|keren|lucu|mantap|asik|cantik|gadis|bisa dong|santai|bro|sob|kuy|gokil|bestie|wkwk|haha|musik|lagu|lofi|putar|nyalain|play)\b/.test(
      lower
    )
  ) {
    return "happy";
  }

  // Surprised / Wonder
  if (/\b(wah|wow|astaga|serius|beneran|kaget|masa sih|waduh|gila|ajaib)\b/.test(lower)) {
    return "surprised";
  }

  // Question words / Explanations / Deep curiosity
  if (
    /\b(kenapa|mengapa|bagaimana|gimana|apa|apakah|siapa|kapan|dimana|jelaskan|artinya|sejarah|definisi)\b|\?/.test(
      lower
    )
  ) {
    return "curious";
  }

  // Code, math, technical tasks
  if (
    /\b(kode|coding|script|python|javascript|typescript|blender|hitung|rumus|fungsi|algoritma|debug|error|program|database|query|sql)\b/.test(
      lower
    )
  ) {
    return "focused";
  }

  // Sad, problems, need help
  if (
    /\b(tolong|sedih|bingung|susah|rusak|gagal|salah|pusing|capek|lelah|bantu|masalah|kecewa)\b/.test(
      lower
    )
  ) {
    return "concerned";
  }

  return "normal";
}

export const PixelEyesAvatar: React.FC<PixelEyesAvatarProps> = ({
  status,
  isMuted = false,
  userQuery = "",
  onInterrupt,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [thinkingTick, setThinkingTick] = useState(0);
  const [speakingTick, setSpeakingTick] = useState(0);
  const [interactiveWink, setInteractiveWink] = useState(false);

  // Compute question emotion from user's latest query
  const queryEmotion = useMemo(() => {
    return detectEmotionFromText(userQuery);
  }, [userQuery]);

  // Natural Blinking Loop (every 2.8s - 4.5s)
  useEffect(() => {
    if (isMuted) return;

    let timeout: NodeJS.Timeout;
    const scheduleBlink = () => {
      const delay = Math.random() * 2000 + 2600;
      timeout = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 140);
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(timeout);
  }, [isMuted]);

  // Thinking processing scan animation loop
  useEffect(() => {
    if (status !== "thinking") {
      setThinkingTick(0);
      return;
    }

    const interval = setInterval(() => {
      setThinkingTick((prev) => (prev + 1) % 4);
    }, 280);

    return () => clearInterval(interval);
  }, [status]);

  // Speaking subtle bounce / rhythm loop
  useEffect(() => {
    if (status !== "speaking") {
      setSpeakingTick(0);
      return;
    }

    const interval = setInterval(() => {
      setSpeakingTick((prev) => (prev + 1) % 4);
    }, 180);

    return () => clearInterval(interval);
  }, [status]);

  // Tap interaction
  const handleClick = () => {
    if (status === "speaking" && onInterrupt) {
      onInterrupt();
    } else {
      setInteractiveWink(true);
      setTimeout(() => setInteractiveWink(false), 600);
    }
  };

  // 8x8 Pixel Matrix Definitions
  // Normal wide open eye (Image 2 style rounded digital block)
  const matrixOpen = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
  ];

  // Happy / Smiling arch ^ ^
  const matrixHappy = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Surprised / Wonder wide eyes O O
  const matrixSurprised = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
  ];

  // Curious left eye (tilted cocked eyebrow)
  const matrixCuriousLeft = [
    [1, 1, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Curious right eye (attentive observant eye)
  const matrixCuriousRight = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Focused / Analytical tech cyber slit
  const matrixFocused = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Concerned / Empathetic caring soft eyes
  const matrixConcernedLeft = [
    [0, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const matrixConcernedRight = [
    [0, 1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Thinking eye frames (scanning upward/sideways)
  const thinkingFrames = [
    [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 1],
      [0, 0, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 1, 1, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 0, 0],
      [1, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  ];

  // Blink horizontal slit
  const matrixBlink = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Sleepy / Muted half-closed eye
  const matrixSleepy = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // 10x4 Mouth Matrix Definitions
  // Normal subtle smile (idle)
  const mouthIdle = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Listening attentive smile
  const mouthListening = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  ];

  // Happy / laughing wide smile
  const mouthHappy = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  ];

  // Surprised / open round mouth 'O'
  const mouthSurprised = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  ];

  // Curious quirky tilted mouth
  const mouthCurious = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Focused straight cyber line
  const mouthFocused = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Concerned soft gentle curve
  const mouthConcerned = [
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];

  // Thinking frames (subtle shifting line)
  const mouthThinkingFrames = [
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  ];

  // Speaking frames (Real-time animated talking syllables/phonemes)
  const mouthSpeakingFrames = [
    // Open talking 'A'
    [
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    ],
    // Medium rounded 'O'
    [
      [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
      [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    ],
    // Cheerful wide open smile
    [
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    ],
    // Compact open 'u'
    [
      [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    ],
    // Cheerful talking curve
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    // Closed consonant bar
    [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  ];

  // Select left and right matrix based on state and query emotion
  let leftMatrix = matrixOpen;
  let rightMatrix = matrixOpen;
  let showBlush = false;
  let mouthMatrix = mouthIdle;

  if (isMuted) {
    leftMatrix = matrixSleepy;
    rightMatrix = matrixSleepy;
    mouthMatrix = mouthIdle;
  } else if (isBlinking || interactiveWink) {
    leftMatrix = matrixBlink;
    rightMatrix = interactiveWink ? matrixHappy : matrixBlink;
    mouthMatrix = interactiveWink ? mouthHappy : mouthIdle;
  } else if (status === "thinking") {
    const currentFrame = thinkingFrames[thinkingTick % thinkingFrames.length];
    leftMatrix = currentFrame;
    rightMatrix = currentFrame;
    mouthMatrix = mouthThinkingFrames[thinkingTick % mouthThinkingFrames.length];
  } else if (status === "speaking") {
    // When AI speaks, adapt expression to the sentiment and animate talking mouth
    mouthMatrix = mouthSpeakingFrames[speakingTick % mouthSpeakingFrames.length];
    if (queryEmotion === "happy") {
      leftMatrix = matrixHappy;
      rightMatrix = matrixHappy;
      showBlush = true;
    } else if (queryEmotion === "surprised") {
      leftMatrix = matrixSurprised;
      rightMatrix = matrixSurprised;
      showBlush = true;
    } else if (queryEmotion === "focused") {
      leftMatrix = matrixFocused;
      rightMatrix = matrixFocused;
    } else if (queryEmotion === "concerned") {
      leftMatrix = matrixConcernedLeft;
      rightMatrix = matrixConcernedRight;
    } else {
      // Cheerful talking eyes with subtle rhythm
      leftMatrix = speakingTick % 2 === 0 ? matrixOpen : matrixHappy;
      rightMatrix = speakingTick % 2 === 0 ? matrixOpen : matrixHappy;
      showBlush = true;
    }
  } else {
    // Listening / Idle: Reflect user question as it's being spoken
    if (queryEmotion === "happy") {
      leftMatrix = matrixHappy;
      rightMatrix = matrixHappy;
      showBlush = true;
      mouthMatrix = status === "listening" ? mouthListening : mouthHappy;
    } else if (queryEmotion === "curious") {
      leftMatrix = matrixCuriousLeft;
      rightMatrix = matrixCuriousRight;
      mouthMatrix = mouthCurious;
    } else if (queryEmotion === "surprised") {
      leftMatrix = matrixSurprised;
      rightMatrix = matrixSurprised;
      showBlush = true;
      mouthMatrix = mouthSurprised;
    } else if (queryEmotion === "focused") {
      leftMatrix = matrixFocused;
      rightMatrix = matrixFocused;
      mouthMatrix = mouthFocused;
    } else if (queryEmotion === "concerned") {
      leftMatrix = matrixConcernedLeft;
      rightMatrix = matrixConcernedRight;
      mouthMatrix = mouthConcerned;
    } else {
      leftMatrix = matrixOpen;
      rightMatrix = matrixOpen;
      mouthMatrix = status === "listening" ? mouthListening : mouthIdle;
    }
  }

  // Render individual eye grid
  const renderEye = (matrix: number[][]) => {
    return (
      <div className="grid grid-cols-8 gap-[3.5px] sm:gap-[4px]">
        {matrix.flatMap((row, r) =>
          row.map((cell, c) => (
            <span
              key={`${r}-${c}`}
              className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-[2px] transition-all duration-150 ${
                cell === 1
                  ? "bg-cyan-400 shadow-[0_0_10px_#22d3ee] opacity-100 scale-100"
                  : "opacity-0 scale-75 pointer-events-none"
              }`}
            />
          ))
        )}
      </div>
    );
  };

  // Render mouth grid
  const renderMouth = (matrix: number[][]) => {
    return (
      <div className="grid grid-cols-10 gap-[3.5px] sm:gap-[4px]">
        {matrix.flatMap((row, r) =>
          row.map((cell, c) => (
            <span
              key={`m-${r}-${c}`}
              className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-[2px] transition-all duration-100 ${
                cell === 1
                  ? "bg-cyan-400 shadow-[0_0_10px_#22d3ee] opacity-100 scale-100"
                  : "opacity-0 scale-75 pointer-events-none"
              }`}
            />
          ))
        )}
      </div>
    );
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={
        status === "speaking"
          ? "Klik untuk menyela AI"
          : "Robot Digital AI (Klik untuk berinteraksi)"
      }
      className="relative flex flex-col items-center justify-center cursor-pointer select-none py-4 transition-transform duration-300 active:scale-95"
    >
      {/* Outer Glow Halo according to status */}
      <div
        className={`absolute w-72 h-44 sm:w-96 sm:h-56 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700 ${
          status === "listening"
            ? "bg-cyan-400"
            : status === "speaking"
            ? "bg-rose-500"
            : status === "thinking"
            ? "bg-purple-500"
            : "bg-neutral-600"
        }`}
      />

      {/* Floating Transparent Container for Pixel Eyes & Mouth */}
      <div className="relative flex flex-col items-center justify-center py-6 px-6">
        {/* The Two Pixel Eyes */}
        <div className="flex items-center gap-10 sm:gap-14 relative z-10">
          {/* Left Eye */}
          <div className="relative">
            {renderEye(leftMatrix)}

            {/* Left Pink Blush (///) */}
            {showBlush && !isMuted && (
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-90 animate-pulse">
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
              </div>
            )}
          </div>

          {/* Right Eye */}
          <div className="relative">
            {renderEye(rightMatrix)}

            {/* Right Pink Blush (///) */}
            {showBlush && !isMuted && (
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-90 animate-pulse">
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
                <span className="w-1.5 h-1 bg-pink-400 rounded-full rotate-[-20deg] shadow-[0_0_6px_#f472b6]" />
              </div>
            )}
          </div>
        </div>

        {/* The Animated Digital LED Pixel Mouth */}
        <div className="mt-6 sm:mt-7 relative z-10 flex items-center justify-center">
          {renderMouth(mouthMatrix)}
        </div>

        {/* Soundwave ripple particles when listening */}
        {status === "listening" && (
          <div className="absolute -bottom-1 flex items-center gap-1.5 pointer-events-none">
            <span className="w-1.5 h-2 bg-cyan-400/80 rounded-full animate-pulse [animation-delay:-0.3s]" />
            <span className="w-1.5 h-3.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.15s]" />
            <span className="w-1.5 h-4.5 bg-cyan-300 rounded-full animate-pulse" />
            <span className="w-1.5 h-3.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:-0.15s]" />
            <span className="w-1.5 h-2 bg-cyan-400/80 rounded-full animate-pulse [animation-delay:-0.3s]" />
          </div>
        )}
      </div>
    </div>
  );
};

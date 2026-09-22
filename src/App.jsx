import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Gamepad2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SIZE = 20;
const keyOf = (x, y) => `${x},${y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;

// مستويات اللعبة مع زيادة الصعوبة وتغيير العقبات
const LEVELS = [
  { name: "تهيئة النظام", subtitle: "إحماء الدوائر", speed: 150, target: 5, walls: () => [] },
  { name: "البوابات المزدوجة", subtitle: "اعبر القنوات المفتوحة", speed: 135, target: 6, walls: () => {
      const out = [];
      for (let y = 3; y < 17; y++) if (![6, 13].includes(y)) out.push({ x: 6, y }, { x: 13, y });
      return out;
  }},
  { name: "الدوامة الرقمية", subtitle: "راقب المتاهة جيداً", speed: 120, target: 7, walls: () => {
      const out = [];
      for (let x = 3; x <= 16; x++) if (x !== 7) out.push({ x, y: 3 });
      for (let y = 3; y <= 16; y++) if (y !== 12) out.push({ x: 16, y });
      for (let x = 5; x <= 16; x++) if (x !== 12) out.push({ x, y: 16 });
      for (let y = 6; y <= 16; y++) if (y !== 9) out.push({ x: 5, y });
      for (let x = 5; x <= 12; x++) if (x !== 8) out.push({ x, y: 6 });
      return out;
  }},
  { name: "قاطع الدائرة", subtitle: "احذر المسارات المتقاطعة", speed: 105, target: 8, walls: () => {
      const out = [];
      [4, 8, 12, 16].forEach((y, i) => {
        for (let x = 2; x < 18; x++) {
          const gap = i % 2 === 0 ? [14, 15] : [4, 5];
          if (!gap.includes(x)) out.push({ x, y });
        }
      });
      return out;
  }},
  { name: "المعالج المركزي", subtitle: "أقصى كثافة للبيانات", speed: 90, target: 10, walls: () => {
      const out = [];
      for (let x = 3; x < 17; x++) if (![6, 13].includes(x)) out.push({ x, y: 4 }, { x, y: 15 });
      for (let y = 5; y < 15; y++) if (![8, 11].includes(y)) out.push({ x: 3, y }, { x: 16, y });
      for (let y = 7; y <= 12; y++) if (y !== 10) out.push({ x: 8, y }, { x: 11, y });
      out.push({ x: 9, y: 7 }, { x: 10, y: 12 });
      return out;
  }},
];

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function randomFood(snake, walls) {
  const blocked = new Set([...snake, ...walls].map((p) => keyOf(p.x, p.y)));
  const options = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!blocked.has(keyOf(x, y))) options.push({ x, y });
    }
  }
  return options[Math.floor(Math.random() * options.length)] || { x: 10, y: 10 };
}

function tinyBeep(enabled, frequency = 460, duration = 0.045) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close();
  } catch {}
}

export default function App() {
  const initialSnake = useMemo(() => [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], []);
  const [levelIndex, setLevelIndex] = useState(0);
  const [snake, setSnake] = useState(initialSnake);
  const [direction, setDirection] = useState(DIRS.right);
  const [food, setFood] = useState({ x: 15, y: 10 });
  const [score, setScore] = useState(0);
  const [levelFood, setLevelFood] = useState(0);
  const [status, setStatus] = useState("ready");
  const [sound, setSound] = useState(true);
  const [message, setMessage] = useState("اضغط تشغيل للبدء");

  const directionRef = useRef(DIRS.right);
  const pendingRef = useRef(DIRS.right);
  const stateRef = useRef({ snake, food, levelIndex, levelFood, score });

  const level = LEVELS[levelIndex];
  const walls = useMemo(() => level.walls(), [levelIndex]);
  const wallSet = useMemo(() => new Set(walls.map((p) => keyOf(p.x, p.y))), [walls]);

  useEffect(() => {
    stateRef.current = { snake, food, levelIndex, levelFood, score };
  }, [snake, food, levelIndex, levelFood, score]);

  const applyDirection = useCallback((next) => {
    const current = directionRef.current;
    if (current.x + next.x === 0 && current.y + next.y === 0) return;
    pendingRef.current = next;
    if (status === "ready") {
      setStatus("playing");
      setMessage("");
    }
  }, [status]);

  const resetLevel = useCallback((idx = levelIndex, keepScore = false) => {
    const fresh = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    const freshWalls = LEVELS[idx].walls();
    directionRef.current = DIRS.right;
    pendingRef.current = DIRS.right;
    setSnake(fresh);
    setDirection(DIRS.right);
    setFood(randomFood(fresh, freshWalls));
    setLevelFood(0);
    if (!keepScore) setScore(0);
    setStatus("ready");
    setMessage(idx === 0 ? "اضغط تشغيل للبدء" : `المستوى ${idx + 1}`);
  }, [levelIndex]);

  const restartGame = useCallback(() => {
    setLevelIndex(0);
    resetLevel(0, false);
  }, [resetLevel]);

  const finishLevel = useCallback((currentScore) => {
    tinyBeep(sound, 760, 0.12);
    if (levelIndex === LEVELS.length - 1) {
      setScore(currentScore);
      setStatus("won");
      setMessage("اكتمل النظام بنجاح!");
      return;
    }
    const nextIndex = levelIndex + 1;
    setStatus("transition");
    setMessage("مستوى مكتمل");
    setTimeout(() => {
      setLevelIndex(nextIndex);
      const fresh = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      const nextWalls = LEVELS[nextIndex].walls();
      directionRef.current = DIRS.right;
      pendingRef.current = DIRS.right;
      setSnake(fresh);
      setDirection(DIRS.right);
      setFood(randomFood(fresh, nextWalls));
      setLevelFood(0);
      setStatus("ready");
      setMessage(`المستوى ${nextIndex + 1}`);
    }, 1200);
  }, [levelIndex, sound]);

  const tick = useCallback(() => {
    const current = stateRef.current;
    const nextDir = pendingRef.current;
    directionRef.current = nextDir;
    setDirection(nextDir);

    const head = current.snake[0];
    const nextHead = {
      x: (head.x + nextDir.x + SIZE) % SIZE,
      y: (head.y + nextDir.y + SIZE) % SIZE,
    };
    const ate = same(nextHead, current.food);
    const bodyToCheck = ate ? current.snake : current.snake.slice(0, -1);
    const hitSelf = bodyToCheck.some((p) => same(p, nextHead));
    const hitWall = wallSet.has(keyOf(nextHead.x, nextHead.y));

    if (hitSelf || hitWall) {
      tinyBeep(sound, 110, 0.2);
      setStatus("gameover");
      setMessage(hitWall ? "اصطدام بالجدار!" : "اصطدام بالمسار!");
      return;
    }

    const nextSnake = [nextHead, ...current.snake];
    if (!ate) nextSnake.pop();

    setSnake(nextSnake);
    if (ate) {
      tinyBeep(sound, 560, 0.06);
      const nextLevelFood = current.levelFood + 1;
      const nextScore = current.score + (levelIndex + 1) * 100;
      setLevelFood(nextLevelFood);
      setScore(nextScore);
      if (nextLevelFood >= level.target) {
        finishLevel(nextScore);
      } else {
        setFood(randomFood(nextSnake, walls));
      }
    }
  }, [finishLevel, level.target, levelIndex, sound, wallSet, walls]);

  useEffect(() => {
    if (status !== "playing") return;
    const timer = setInterval(tick, level.speed);
    return () => clearInterval(timer);
  }, [status, tick, level.speed]);

  // دعم لوحة المفاتيح
  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: DIRS.up, w: DIRS.up, W: DIRS.up,
        ArrowDown: DIRS.down, s: DIRS.down, S: DIRS.down,
        ArrowLeft: DIRS.left, a: DIRS.left, A: DIRS.left,
        ArrowRight: DIRS.right, d: DIRS.right, D: DIRS.right,
      };
      if (map[e.key]) {
        e.preventDefault();
        applyDirection(map[e.key]);
      }
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [applyDirection]);

  const togglePlay = () => {
    setStatus((prev) => {
      if (prev === "playing") {
        setMessage("متوقف مؤقتاً");
        return "paused";
      } else if (["ready", "paused"].includes(prev)) {
        setMessage("");
        return "playing";
      } else if (prev === "gameover" || prev === "won") {
        prev === "won" ? restartGame() : resetLevel(levelIndex, true);
        return "ready";
      }
      return prev;
    });
  };

  const snakeMap = useMemo(() => {
    const map = new Map();
    snake.forEach((p, i) => map.set(keyOf(p.x, p.y), i));
    return map;
  }, [snake]);

  const progress = Math.min(100, (levelFood / level.target) * 100);

  return (
    <main className="min-h-[100dvh] bg-[#0f120e] text-[#e8eadf] flex items-center justify-center p-2 sm:p-6 font-cairo select-none overflow-hidden touch-none">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_320px] gap-4 lg:gap-6 items-start lg:items-center">
        
        {/* شاشة اللعبة */}
        <section className="relative rounded-[1.5rem] bg-[#1a2118] p-3 sm:p-5 shadow-2xl border border-[#2d3a29] order-2 lg:order-1">
          <div className="flex items-center justify-between px-2 pb-3 text-[#a3b398]">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-[#85d852]" />
              <h1 className="text-lg sm:text-xl font-bold tracking-wide">ألعاب رِيشة</h1>
            </div>
            <div className="text-left font-mono text-xs sm:text-sm">
              <p>LVL {String(levelIndex + 1).padStart(2, "0")}/05</p>
              <p className="text-[#85d852]">{String(score).padStart(6, "0")}</p>
            </div>
          </div>

          <div dir="ltr" className="relative aspect-square w-full max-w-[85dvh] mx-auto overflow-hidden rounded-xl bg-[#98a883] border-[6px] border-[#36422d] shadow-[inset_0_0_20px_#00000044]">
            {/* الشبكة الوهمية للأساس */}
            <div
              className="absolute inset-0 grid opacity-15 pointer-events-none"
              style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}
            >
              {Array.from({ length: SIZE * SIZE }).map((_, i) => (
                <div key={i} className="border-[0.5px] border-[#000]" />
              ))}
            </div>

            {/* عناصر اللعبة */}
            <div
              className="absolute inset-0 grid p-[2px]"
              style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}
            >
              {Array.from({ length: SIZE * SIZE }).map((_, i) => {
                const x = i % SIZE;
                const y = Math.floor(i / SIZE);
                const k = keyOf(x, y);
                const segment = snakeMap.get(k);
                const isWall = wallSet.has(k);
                const isFood = food.x === x && food.y === y;
                return (
                  <div key={k} className="relative p-[5%]">
                    {isWall && <div className="w-full h-full bg-[#2a3322] rounded-[10%] shadow-md" />}
                    {isFood && (
                      <motion.div
                        className="w-full h-full rounded-full bg-[#182112] shadow-[0_0_8px_#182112]"
                        animate={{ scale: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    )}
                    {segment !== undefined && (
                      <div className={`w-full h-full bg-[#11180f] ${segment === 0 ? "rounded-[30%] shadow-[0_0_5px_#000]" : "rounded-[15%] opacity-90"}`}>
                        {segment === 0 && (
                          <div className="w-full h-full flex justify-around items-start pt-[20%] px-[15%]">
                            <i className="w-[18%] aspect-square rounded-full bg-[#98a883]" />
                            <i className="w-[18%] aspect-square rounded-full bg-[#98a883]" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* رسائل التراكب */}
            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="absolute inset-0 bg-[#98a883]/80 backdrop-blur-sm flex items-center justify-center z-10"
                >
                  <div className="text-center px-4 text-[#11180f]">
                    {status === "won" && <Trophy className="w-12 h-12 mx-auto mb-3 text-[#11180f]" />}
                    <p className="text-2xl sm:text-4xl font-bold">{message}</p>
                    <p className="mt-2 text-sm sm:text-base opacity-80 font-mono">
                      {status === "gameover" ? "أعد المحاولة" : status === "won" ? `النتيجة النهائية: ${score}` : level.subtitle}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* شريط التقدم */}
          <div className="mt-4 px-2 flex items-center gap-3 text-[#a3b398]">
            <span className="text-xs font-bold font-mono min-w-[50px]">DATA</span>
            <div className="flex-1 h-2 rounded-full bg-[#2d3a29] overflow-hidden">
              <motion.div className="h-full bg-[#85d852]" animate={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-bold font-mono">{levelFood}/{level.target}</span>
          </div>
        </section>

        {/* لوحة التحكم الجانبية / السفلية */}
        <aside className="rounded-[1.5rem] bg-[#222a20] p-4 sm:p-5 shadow-lg border border-[#313f2d] flex flex-col gap-5 order-1 lg:order-2">
          
          <div className="flex items-start justify-between gap-2 border-b border-[#313f2d] pb-4">
            <div>
              <p className="text-[10px] font-bold text-[#85d852] tracking-wider mb-1">البرنامج الحالي</p>
              <h2 className="text-xl font-bold text-white">{level.name}</h2>
            </div>
            <button onClick={() => setSound(!sound)} className="p-2 rounded-xl bg-[#313f2d] text-white hover:bg-[#3d4f38] transition-colors" aria-label="الصوت">
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={restartGame} className="rounded-xl bg-[#313f2d] hover:bg-[#3d4f38] p-3 flex justify-center items-center transition-colors">
              <RotateCcw size={20} />
            </button>
            <button onClick={togglePlay} className="col-span-2 rounded-xl bg-[#85d852] text-[#0f120e] hover:bg-[#97e366] px-4 py-3 font-bold flex items-center justify-center gap-2 transition-colors text-lg">
              {status === "playing" ? <Pause size={20} /> : <Play size={20} />}
              {status === "playing" ? "إيقاف مؤقت" : status === "gameover" ? "إعادة المحاولة" : status === "won" ? "لعبة جديدة" : "تشغيل"}
            </button>
          </div>

          {/* أسهم التحكم لشاشات اللمس */}
          <div dir="ltr" className="mx-auto w-48 grid grid-cols-3 gap-2 mt-2">
            <span />
            <Control icon={<ArrowUp />} onClick={() => applyDirection(DIRS.up)} />
            <span />
            <Control icon={<ArrowLeft />} onClick={() => applyDirection(DIRS.left)} />
            <Control icon={<ArrowDown />} onClick={() => applyDirection(DIRS.down)} />
            <Control icon={<ArrowRight />} onClick={() => applyDirection(DIRS.right)} />
          </div>

          <div className="text-xs text-[#a3b398] text-center mt-2 leading-relaxed">
            <p>استخدم الأسهم أو WASD للتحكم.</p>
            <p>زر المسافة (Space) للإيقاف المؤقت.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

// مكون فرعي لأزرار التحكم
function Control({ icon, onClick }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      className="aspect-square rounded-2xl bg-[#313f2d] hover:bg-[#3d4f38] text-white grid place-items-center active:scale-95 transition-all touch-manipulation shadow-md border-b-4 border-[#1a2118] active:border-b-0 active:translate-y-1"
    >
      {React.cloneElement(icon, { size: 28 })}
    </button>
  );
}

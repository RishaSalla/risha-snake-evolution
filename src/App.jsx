import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Gamepad2, Star, Home, Lock, Unlock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SIZE = 20;
const keyOf = (x, y) => `${x},${y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;

// إعدادات المراحل مع أوقات التقييم (بالثواني)
const LEVELS = [
  { name: "تهيئة النظام", subtitle: "إحماء الدوائر", speed: 150, target: 5, time3Stars: 15, time2Stars: 25, walls: () => [] },
  { name: "البوابات المزدوجة", subtitle: "اعبر القنوات المفتوحة", speed: 135, target: 6, time3Stars: 20, time2Stars: 30, walls: () => {
      const out = [];
      for (let y = 3; y < 17; y++) if (![6, 13].includes(y)) out.push({ x: 6, y }, { x: 13, y });
      return out;
  }},
  { name: "الدوامة الرقمية", subtitle: "راقب المتاهة جيداً", speed: 120, target: 7, time3Stars: 25, time2Stars: 40, walls: () => {
      const out = [];
      for (let x = 3; x <= 16; x++) if (x !== 7) out.push({ x, y: 3 });
      for (let y = 3; y <= 16; y++) if (y !== 12) out.push({ x: 16, y });
      for (let x = 5; x <= 16; x++) if (x !== 12) out.push({ x, y: 16 });
      for (let y = 6; y <= 16; y++) if (y !== 9) out.push({ x: 5, y });
      for (let x = 5; x <= 12; x++) if (x !== 8) out.push({ x, y: 6 });
      return out;
  }},
  { name: "قاطع الدائرة", subtitle: "احذر المسارات المتقاطعة", speed: 105, target: 8, time3Stars: 30, time2Stars: 45, walls: () => {
      const out = [];
      [4, 8, 12, 16].forEach((y, i) => {
        for (let x = 2; x < 18; x++) {
          const gap = i % 2 === 0 ? [14, 15] : [4, 5];
          if (!gap.includes(x)) out.push({ x, y });
        }
      });
      return out;
  }},
  { name: "المعالج المركزي", subtitle: "أقصى كثافة للبيانات", speed: 90, target: 10, time3Stars: 40, time2Stars: 60, walls: () => {
      const out = [];
      for (let x = 3; x < 17; x++) if (![6, 13].includes(x)) out.push({ x, y: 4 }, { x, y: 15 });
      for (let y = 5; y < 15; y++) if (![8, 11].includes(y)) out.push({ x: 3, y }, { x: 16, y });
      for (let y = 7; y <= 12; y++) if (y !== 10) out.push({ x: 8, y }, { x: 11, y });
      out.push({ x: 9, y: 7 }, { x: 10, y: 12 });
      return out;
  }},
];

const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// تحسين دالة الطعام لمنع التعليق
function randomFood(snake, walls) {
  const blocked = new Set([...snake, ...walls].map((p) => keyOf(p.x, p.y)));
  const options = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!blocked.has(keyOf(x, y))) options.push({ x, y });
    }
  }
  return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : { x: 10, y: 10 };
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
  // حالة التطبيق: menu, levels, playing, paused, gameover, cleared
  const [appState, setAppState] = useState("menu");
  const [progress, setProgress] = useState({ unlocked: 0, stars: [0, 0, 0, 0, 0] });
  
  const initialSnake = useMemo(() => [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], []);
  const [levelIndex, setLevelIndex] = useState(0);
  const [snake, setSnake] = useState(initialSnake);
  const [direction, setDirection] = useState(DIRS.right);
  const [food, setFood] = useState({ x: 15, y: 10 });
  const [score, setScore] = useState(0);
  const [levelFood, setLevelFood] = useState(0);
  const [sound, setSound] = useState(true);
  
  const [startTime, setStartTime] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [earnedStars, setEarnedStars] = useState(0);

  const directionRef = useRef(DIRS.right);
  const pendingRef = useRef(DIRS.right);
  const stateRef = useRef({ snake, food, levelIndex, levelFood, score });

  const level = LEVELS[levelIndex];
  const walls = useMemo(() => level.walls(), [levelIndex]);
  const wallSet = useMemo(() => new Set(walls.map((p) => keyOf(p.x, p.y))), [walls]);

  // تحميل الحفظ عند البدء
  useEffect(() => {
    const saved = localStorage.getItem('risha_snake_progress');
    if (saved) {
      try { setProgress(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  // حفظ التقدم
  const saveProgress = (newUnlocked, newStarsArray) => {
    const newProgress = { unlocked: Math.max(progress.unlocked, newUnlocked), stars: newStarsArray };
    setProgress(newProgress);
    localStorage.setItem('risha_snake_progress', JSON.stringify(newProgress));
  };

  useEffect(() => {
    stateRef.current = { snake, food, levelIndex, levelFood, score };
  }, [snake, food, levelIndex, levelFood, score]);

  const startLevel = useCallback((idx) => {
    setLevelIndex(idx);
    const fresh = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    const freshWalls = LEVELS[idx].walls();
    directionRef.current = DIRS.right;
    pendingRef.current = DIRS.right;
    setSnake(fresh);
    setDirection(DIRS.right);
    setFood(randomFood(fresh, freshWalls));
    setLevelFood(0);
    setScore(0);
    setStartTime(Date.now());
    setAppState("playing");
  }, []);

  const finishLevel = useCallback((currentScore) => {
    tinyBeep(sound, 760, 0.12);
    const timeTaken = (Date.now() - startTime) / 1000;
    setTimeElapsed(timeTaken);
    
    let stars = 1;
    if (timeTaken <= level.time3Stars) stars = 3;
    else if (timeTaken <= level.time2Stars) stars = 2;
    setEarnedStars(stars);

    const newStars = [...progress.stars];
    if (stars > newStars[levelIndex]) newStars[levelIndex] = stars;
    
    saveProgress(levelIndex + 1, newStars);
    setScore(currentScore);
    setAppState("cleared");
  }, [levelIndex, sound, startTime, level, progress]);

  const tick = useCallback(() => {
    if (appState !== "playing") return;
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
      setAppState("gameover");
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
  }, [appState, finishLevel, level.target, levelIndex, sound, wallSet, walls]);

  useEffect(() => {
    if (appState !== "playing") return;
    const timer = setInterval(tick, level.speed);
    return () => clearInterval(timer);
  }, [appState, tick, level.speed]);

  const applyDirection = useCallback((next) => {
    const current = directionRef.current;
    if (current.x + next.x === 0 && current.y + next.y === 0) return;
    pendingRef.current = next;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowUp: DIRS.up, w: DIRS.up, ArrowDown: DIRS.down, s: DIRS.down, ArrowLeft: DIRS.left, a: DIRS.left, ArrowRight: DIRS.right, d: DIRS.right };
      if (map[e.key] && appState === "playing") {
        e.preventDefault();
        applyDirection(map[e.key]);
      }
      if (e.key === " ") {
        e.preventDefault();
        if (appState === "playing") setAppState("paused");
        else if (appState === "paused") setAppState("playing");
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [appState, applyDirection]);

  const snakeMap = useMemo(() => {
    const map = new Map();
    snake.forEach((p, i) => map.set(keyOf(p.x, p.y), i));
    return map;
  }, [snake]);

  const renderStars = (count, animated = false) => {
    return Array(3).fill(0).map((_, i) => (
      <Star key={i} size={animated ? 32 : 16} className={`${i < count ? "text-yellow-400 fill-yellow-400" : "text-gray-600"} ${animated && i < count ? `star-animate star-delay-${i + 1}` : ""}`} />
    ));
  };

  // ---------------- شاشات الواجهة ----------------
  if (appState === "menu") {
    return (
      <main className="min-h-[100dvh] bg-[#0a0c09] flex flex-col font-cairo text-white">
        {/* شريط الإعلان */}
        <a href="https://www.risha.sa" target="_blank" rel="noopener noreferrer" className="relative bg-[#85d852] text-[#0f120e] p-2 text-center text-sm font-bold block overflow-hidden shimmer-effect hover:bg-[#97e366] transition-colors">
          <div className="flex items-center justify-center gap-2">
            <img src="/LOGO-RISHA.png" alt="ريشة" className="h-5 w-5 object-contain" />
            <span>اكتشف المزيد من المنتجات الرقمية والألعاب على متجر رِيشة</span>
          </div>
        </a>
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
          <img src="/LOGO-RISHA.png" alt="شعار ريشة مائي" className="absolute opacity-5 w-2/3 max-w-md pointer-events-none" />
          <Gamepad2 className="w-20 h-20 text-[#85d852] mb-4 z-10" />
          <h1 className="text-4xl sm:text-5xl font-black mb-2 z-10 tracking-wider text-transparent bg-clip-text bg-gradient-to-l from-[#85d852] to-white">تحدي الثعبان</h1>
          <p className="text-[#a3b398] mb-12 z-10 text-lg">مقدمة من رِيشة للألعاب</p>
          <button onClick={() => setAppState("levels")} className="bg-[#85d852] text-black px-12 py-4 rounded-2xl font-bold text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(133,216,82,0.4)] z-10">
            ابدأ اللعب
          </button>
        </div>
      </main>
    );
  }

  if (appState === "levels") {
    return (
      <main className="min-h-[100dvh] bg-[#0a0c09] flex flex-col font-cairo text-white p-6">
        <div className="max-w-4xl w-full mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setAppState("menu")} className="p-3 bg-[#1a2118] rounded-xl hover:bg-[#2d3a29] transition-colors"><Home size={24} /></button>
            <h2 className="text-2xl font-bold">اختيار المرحلة</h2>
            <div className="w-12"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEVELS.map((lvl, idx) => {
              const isUnlocked = idx <= progress.unlocked;
              const lvlStars = progress.stars[idx];
              return (
                <button
                  key={idx}
                  disabled={!isUnlocked}
                  onClick={() => startLevel(idx)}
                  className={`p-5 rounded-2xl border-2 text-right transition-all flex flex-col gap-3
                    ${isUnlocked ? "bg-[#1a2118] border-[#313f2d] hover:border-[#85d852] active:scale-95 cursor-pointer" : "bg-[#0f120e] border-[#1a2118] opacity-60 cursor-not-allowed"}`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="text-3xl font-black text-[#313f2d]">{idx + 1}</span>
                    {isUnlocked ? <div className="flex gap-1">{renderStars(lvlStars)}</div> : <Lock className="text-gray-600" />}
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg ${isUnlocked ? "text-white" : "text-gray-500"}`}>{lvl.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{lvl.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // واجهة اللعب الأساسية
  return (
    <main className="min-h-[100dvh] bg-[#0a0c09] text-[#e8eadf] flex flex-col font-cairo select-none overflow-hidden touch-none">
       {/* شريط الإعلان المصغر أثناء اللعب */}
       <a href="https://www.risha.sa" target="_blank" rel="noopener noreferrer" className="bg-[#1a2118] border-b border-[#313f2d] p-1.5 text-center text-[10px] sm:text-xs text-[#a3b398] block hover:text-[#85d852] transition-colors">
          <div className="flex items-center justify-center gap-1.5">
            <img src="/LOGO-RISHA.png" alt="ريشة" className="h-3 w-3 opacity-70" />
            <span>متجر رِيشة للبطاقات والمنتجات الرقمية - www.risha.sa</span>
          </div>
        </a>

      <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_320px] gap-4 items-start lg:items-center">
          
          {/* قسم الشاشة */}
          <section className="relative rounded-[1.5rem] bg-[#1a2118] p-3 sm:p-5 shadow-2xl border border-[#2d3a29] order-2 lg:order-1">
            <div className="flex items-center justify-between px-2 pb-3 text-[#a3b398]">
              <div className="flex items-center gap-2">
                <button onClick={() => setAppState("levels")} className="hover:text-white transition-colors"><Home size={20}/></button>
                <h1 className="text-base sm:text-lg font-bold">المستوى {levelIndex + 1}</h1>
              </div>
              <div className="text-left font-mono text-xs sm:text-sm text-[#85d852]">{String(score).padStart(6, "0")}</div>
            </div>

            <div dir="ltr" className="relative aspect-square w-full max-w-[80dvh] mx-auto overflow-hidden rounded-xl bg-[#98a883] border-[6px] border-[#36422d]">
              <div className="absolute inset-0 grid opacity-15 pointer-events-none" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}>
                {Array.from({ length: SIZE * SIZE }).map((_, i) => <div key={i} className="border-[0.5px] border-[#000]" />)}
              </div>
              <div className="absolute inset-0 grid p-[2px]" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}>
                {Array.from({ length: SIZE * SIZE }).map((_, i) => {
                  const x = i % SIZE; const y = Math.floor(i / SIZE); const k = keyOf(x, y);
                  const segment = snakeMap.get(k); const isWall = wallSet.has(k); const isFood = food.x === x && food.y === y;
                  return (
                    <div key={k} className="relative p-[5%]">
                      {isWall && <div className="w-full h-full bg-[#2a3322] rounded-[10%] shadow-md" />}
                      {isFood && <motion.div className="w-full h-full rounded-full bg-[#182112]" animate={{ scale: [0.7, 1, 0.7] }} transition={{ duration: 0.8, repeat: Infinity }} />}
                      {segment !== undefined && (
                        <div className={`w-full h-full bg-[#11180f] ${segment === 0 ? "rounded-[30%]" : "rounded-[15%] opacity-90"}`}>
                          {segment === 0 && (
                            <div className="w-full h-full flex justify-around items-start pt-[20%] px-[15%]">
                              <i className="w-[18%] aspect-square rounded-full bg-[#98a883]" /><i className="w-[18%] aspect-square rounded-full bg-[#98a883]" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* نوافذ الحالات المتراكبة */}
              <AnimatePresence>
                {appState !== "playing" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#98a883]/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-[#11180f] p-4 text-center">
                    {appState === "paused" && <><Pause size={48} className="mb-2"/><h2 className="text-3xl font-black">إيقاف مؤقت</h2></>}
                    {appState === "gameover" && <><RotateCcw size={48} className="mb-2"/><h2 className="text-3xl font-black text-red-900">انتهت اللعبة</h2><p className="mt-2">اصطدمت بالمسار!</p></>}
                    {appState === "cleared" && (
                      <>
                        <Trophy size={48} className="mb-4 text-yellow-600"/>
                        <h2 className="text-3xl font-black mb-4">اكتملت المرحلة!</h2>
                        <div className="flex gap-2 justify-center mb-4" dir="ltr">{renderStars(earnedStars, true)}</div>
                        <p className="font-mono text-sm opacity-80 mb-6">الوقت: {timeElapsed.toFixed(1)} ثانية</p>
                        <div className="flex gap-3">
                          <button onClick={() => startLevel(levelIndex)} className="px-4 py-2 bg-[#2a3322] text-[#98a883] rounded-lg font-bold">إعادة</button>
                          {levelIndex < LEVELS.length - 1 ? (
                            <button onClick={() => startLevel(levelIndex + 1)} className="px-6 py-2 bg-[#11180f] text-[#85d852] rounded-lg font-bold">التالي</button>
                          ) : (
                            <button onClick={() => setAppState("levels")} className="px-6 py-2 bg-[#11180f] text-[#85d852] rounded-lg font-bold">إنهاء</button>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-4 px-2 flex items-center gap-3 text-[#a3b398]">
              <span className="text-xs font-bold font-mono min-w-[50px]">DATA</span>
              <div className="flex-1 h-2 rounded-full bg-[#2d3a29] overflow-hidden">
                <motion.div className="h-full bg-[#85d852]" animate={{ width: `${Math.min(100, (levelFood / level.target) * 100)}%` }} />
              </div>
              <span className="text-xs font-bold font-mono">{levelFood}/{level.target}</span>
            </div>
          </section>

          {/* لوحة التحكم */}
          <aside className="rounded-[1.5rem] bg-[#222a20] p-4 sm:p-5 shadow-lg border border-[#313f2d] flex flex-col gap-4 order-1 lg:order-2">
            <div className="flex justify-between items-center border-b border-[#313f2d] pb-3">
              <div><p className="text-[10px] text-[#85d852] font-bold">المرحلة الحالية</p><h2 className="text-lg font-bold text-white">{level.name}</h2></div>
              <button onClick={() => setSound(!sound)} className="p-2 rounded-xl bg-[#313f2d] text-white"><Volume2 size={20} opacity={sound?1:0.3}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => startLevel(levelIndex)} className="rounded-xl bg-[#313f2d] p-3 flex justify-center text-white"><RotateCcw size={20} /></button>
              <button onClick={() => { if(appState === "playing") setAppState("paused"); else if(appState==="paused") setAppState("playing"); }} className="rounded-xl bg-[#85d852] text-black font-bold flex items-center justify-center gap-2">
                {appState === "playing" ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </div>
            <div dir="ltr" className="mx-auto w-48 grid grid-cols-3 gap-2 mt-4">
              <span /><Control icon={<ArrowUp />} onClick={() => applyDirection(DIRS.up)} /><span />
              <Control icon={<ArrowLeft />} onClick={() => applyDirection(DIRS.left)} />
              <Control icon={<ArrowDown />} onClick={() => applyDirection(DIRS.down)} />
              <Control icon={<ArrowRight />} onClick={() => applyDirection(DIRS.right)} />
            </div>
            <div className="text-[10px] text-gray-500 text-center mt-2">حقوق النشر والتطوير © لمنصة رِيشة</div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Control({ icon, onClick }) {
  return (
    <button onPointerDown={(e) => { e.preventDefault(); onClick(); }} className="aspect-square rounded-2xl bg-[#313f2d] hover:bg-[#3d4f38] text-white grid place-items-center active:scale-95 touch-manipulation border-b-4 border-[#1a2118] active:border-b-0 active:translate-y-1">
      {React.cloneElement(icon, { size: 28 })}
    </button>
  );
}

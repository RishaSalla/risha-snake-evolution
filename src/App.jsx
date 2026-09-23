import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Star, Home, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SIZE = 20;
const keyOf = (x, y) => `${x},${y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;

// الأيقونة الحصرية للعبة (ثعبان بكسل) بدلاً من ذراع التحكم العشوائية
function PixelSnakeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="2" y="16" width="4" height="4" rx="1" />
      <rect x="6" y="16" width="4" height="4" rx="1" />
      <rect x="10" y="16" width="4" height="4" rx="1" />
      <rect x="10" y="12" width="4" height="4" rx="1" />
      <rect x="14" y="12" width="4" height="4" rx="1" />
      <rect x="14" y="8" width="4" height="4" rx="1" />
      <rect x="18" y="8" width="4" height="4" rx="1" />
      <circle cx="20" cy="10" r="0.6" fill="#000" />
    </svg>
  );
}

// خوارزمية توليد المراحل اللانهائية (خرائط ذكية متصاعدة الصعوبة)
function generateWalls(level) {
  if (level === 0) return [];
  const out = [];
  const pattern = level % 6;
  const expansion = Math.min(Math.floor(level / 6), 4); // تزداد الصعوبة كل 6 مراحل

  for (let i = 2; i < SIZE - 2; i++) {
    // تشكيلات هندسية متغيرة
    if (pattern === 1 && (i < 8 || i > 11)) { out.push({x: i, y: 4}); out.push({x: i, y: 15}); }
    if (pattern === 2 && (i < 8 || i > 11)) { out.push({x: 4, y: i}); out.push({x: 15, y: i}); }
    if (pattern === 3 && i > 3 && i < 16 && i !== 9 && i !== 10) { out.push({x: i, y: i}); out.push({x: i, y: SIZE - 1 - i}); }
    if (pattern === 4 && i % 2 === 0) { out.push({x: 6, y: i}); out.push({x: 13, y: i}); }
    if (pattern === 5 && i > 4 && i < 15) { out.push({x: i, y: 6}); out.push({x: i, y: 13}); }
  }

  // إضافة نقاط تعقيد إضافية للمراحل المتقدمة
  if (expansion > 0) out.push({x:2, y:2}, {x:17,y:17}, {x:2,y:17}, {x:17,y:2});
  if (expansion > 1) out.push({x:10, y:2}, {x:10,y:17});
  if (expansion > 2) out.push({x:2, y:10}, {x:17,y:10});

  // تنظيف التكرار
  return Array.from(new Set(out.map(p => keyOf(p.x, p.y)))).map(str => {
    const [x,y] = str.split(',').map(Number);
    return {x,y};
  });
}

const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

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
  const [appState, setAppState] = useState("menu"); // menu, levels, playing, paused, gameover, cleared
  const [progress, setProgress] = useState({ unlocked: 0, stars: {} });
  
  const initialSnake = useMemo(() => [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], []);
  const [levelIndex, setLevelIndex] = useState(0);
  const [snake, setSnake] = useState(initialSnake);
  const [direction, setDirection] = useState(DIRS.right);
  const [food, setFood] = useState({ x: 15, y: 10 });
  const [score, setScore] = useState(0);
  const [levelFood, setLevelFood] = useState(0);
  const [sound, setSound] = useState(true);
  
  // نظام الانطلاقة الآمنة والسرعة الذكية
  const [isMoving, setIsMoving] = useState(false);
  const targetFood = 5 + Math.floor(levelIndex * 1.5); // الهدف يزداد بذكاء كل مرحلة
  const baseSpeed = Math.max(80, 200 - (levelIndex * 4)); // السرعة الأساسية للمرحلة
  const currentSpeed = Math.max(50, baseSpeed - (levelFood * 2)); // تزداد السرعة بشكل طفيف جداً مع كل تفاحة

  const [startTime, setStartTime] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [earnedStars, setEarnedStars] = useState(0);

  const directionRef = useRef(DIRS.right);
  const pendingRef = useRef(DIRS.right);
  const stateRef = useRef({ snake, food, levelIndex, levelFood, score });

  const walls = useMemo(() => generateWalls(levelIndex), [levelIndex]);
  const wallSet = useMemo(() => new Set(walls.map((p) => keyOf(p.x, p.y))), [walls]);

  useEffect(() => {
    const saved = localStorage.getItem('risha_snake_progress');
    if (saved) {
      try { setProgress(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  const saveProgress = (newUnlocked, newStarsDict) => {
    const newProgress = { unlocked: Math.max(progress.unlocked, newUnlocked), stars: newStarsDict };
    setProgress(newProgress);
    localStorage.setItem('risha_snake_progress', JSON.stringify(newProgress));
  };

  useEffect(() => {
    stateRef.current = { snake, food, levelIndex, levelFood, score };
  }, [snake, food, levelIndex, levelFood, score]);

  const startLevel = useCallback((idx) => {
    setLevelIndex(idx);
    const fresh = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    const freshWalls = generateWalls(idx);
    directionRef.current = DIRS.right;
    pendingRef.current = DIRS.right;
    setSnake(fresh);
    setDirection(DIRS.right);
    setFood(randomFood(fresh, freshWalls));
    setLevelFood(0);
    setScore(0);
    setIsMoving(false); // إيقاف الحركة حتى يضغط اللاعب
    setStartTime(Date.now());
    setAppState("playing");
  }, []);

  const finishLevel = useCallback((currentScore) => {
    tinyBeep(sound, 760, 0.12);
    const timeTaken = (Date.now() - startTime) / 1000;
    setTimeElapsed(timeTaken);
    
    // تقييم النجوم بناءً على سرعة الإنجاز
    const idealTime = targetFood * (baseSpeed / 1000) * 4; 
    let stars = 1;
    if (timeTaken <= idealTime) stars = 3;
    else if (timeTaken <= idealTime * 1.5) stars = 2;
    setEarnedStars(stars);

    const newStars = { ...progress.stars };
    if (!newStars[levelIndex] || stars > newStars[levelIndex]) newStars[levelIndex] = stars;
    
    saveProgress(levelIndex + 1, newStars);
    setScore(currentScore);
    setAppState("cleared");
  }, [levelIndex, sound, startTime, targetFood, baseSpeed, progress]);

  const tick = useCallback(() => {
    if (appState !== "playing" || !isMoving) return;
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
      const nextScore = current.score + ((levelIndex + 1) * 10);
      setLevelFood(nextLevelFood);
      setScore(nextScore);
      if (nextLevelFood >= targetFood) {
        finishLevel(nextScore);
      } else {
        setFood(randomFood(nextSnake, walls));
      }
    }
  }, [appState, isMoving, finishLevel, targetFood, levelIndex, sound, wallSet, walls]);

  useEffect(() => {
    if (appState !== "playing" || !isMoving) return;
    const timer = setInterval(tick, currentSpeed);
    return () => clearInterval(timer);
  }, [appState, isMoving, tick, currentSpeed]);

  const applyDirection = useCallback((next) => {
    const current = directionRef.current;
    // منع الرجوع للخلف المباشر
    if (current.x + next.x === 0 && current.y + next.y === 0 && isMoving) return;
    pendingRef.current = next;
    if (!isMoving && appState === "playing") {
      setIsMoving(true); // الانطلاق الذكي عند أول ضغطة
      setStartTime(Date.now());
    }
  }, [isMoving, appState]);

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
        <a href="https://www.risha.sa" target="_blank" rel="noopener noreferrer" className="relative bg-[#85d852] text-[#0f120e] p-2 text-center text-sm font-bold block overflow-hidden shimmer-effect hover:bg-[#97e366] transition-colors">
          <div className="flex items-center justify-center gap-2">
            {/* استخدام الصورة مع منع الخطأ البصري في حال لم يتم العثور عليها */}
            <img src="/LOGO-RISHA.png" alt="" className="h-5 w-5 object-contain" onError={(e) => e.target.style.display='none'} />
            <span>اكتشف المزيد من المنتجات الرقمية والألعاب على متجر رِيشة</span>
          </div>
        </a>
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
          <img src="/LOGO-RISHA.png" alt="" className="absolute opacity-5 w-2/3 max-w-md pointer-events-none" onError={(e) => e.target.style.display='none'} />
          <PixelSnakeIcon className="w-20 h-20 text-[#85d852] mb-4 z-10" />
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
    // عرض 15 مرحلة (أو أكثر) بناءً على تقدم اللاعب، مع إظهار مرحلة مقفلة إضافية للتحفيز
    const maxVisibleLevels = Math.max(15, progress.unlocked + 3);
    const levelsArray = Array.from({ length: maxVisibleLevels });

    return (
      <main className="min-h-[100dvh] bg-[#0a0c09] flex flex-col font-cairo text-white p-6 overflow-y-auto">
        <div className="max-w-4xl w-full mx-auto pb-10">
          <div className="flex items-center justify-between mb-8 sticky top-0 bg-[#0a0c09] py-4 z-20">
            <button onClick={() => setAppState("menu")} className="p-3 bg-[#1a2118] rounded-xl hover:bg-[#2d3a29] transition-colors"><Home size={24} /></button>
            <h2 className="text-2xl font-bold text-[#85d852]">المراحل</h2>
            <div className="w-12"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {levelsArray.map((_, idx) => {
              const isUnlocked = idx <= progress.unlocked;
              const lvlStars = progress.stars[idx] || 0;
              return (
                <button
                  key={idx}
                  disabled={!isUnlocked}
                  onClick={() => startLevel(idx)}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 aspect-square
                    ${isUnlocked ? "bg-[#1a2118] border-[#313f2d] hover:border-[#85d852] active:scale-95 cursor-pointer" : "bg-[#0f120e] border-[#1a2118] opacity-60 cursor-not-allowed"}`}
                >
                  <span className={`text-4xl font-black ${isUnlocked ? "text-white" : "text-[#313f2d]"}`}>{idx + 1}</span>
                  {isUnlocked ? <div className="flex gap-1">{renderStars(lvlStars)}</div> : <Lock className="text-[#313f2d] w-6 h-6" />}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // الواجهة الرئيسية للعب - تم بناء التصميم ليكون صحيحاً 100% على الجوال (اللعبة في الأعلى، التحكم في الأسفل)
  return (
    <main className="min-h-[100dvh] bg-[#0a0c09] text-[#e8eadf] flex flex-col font-cairo select-none overflow-hidden touch-none">
       <a href="https://www.risha.sa" target="_blank" rel="noopener noreferrer" className="bg-[#1a2118] border-b border-[#313f2d] p-1.5 text-center text-[10px] sm:text-xs text-[#a3b398] block hover:text-[#85d852] transition-colors shrink-0">
          <div className="flex items-center justify-center gap-1.5">
            <img src="/LOGO-RISHA.png" alt="" className="h-3 w-3 opacity-70" onError={(e) => e.target.style.display='none'} />
            <span>متجر رِيشة للبطاقات والمنتجات الرقمية - www.risha.sa</span>
          </div>
        </a>

      {/* الحاوية المرنة لضمان عدم الاقتطاع */}
      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-4 p-2 sm:p-4 min-h-0">
        
        {/* قسم الشاشة (يظهر أولاً دائماً) */}
        <section className="flex-1 flex flex-col min-h-0 rounded-[1.5rem] bg-[#1a2118] p-3 sm:p-5 shadow-2xl border border-[#2d3a29]">
          <div className="flex items-center justify-between px-2 pb-3 text-[#a3b398] shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setAppState("levels")} className="hover:text-white transition-colors"><Home size={20}/></button>
              <h1 className="text-base sm:text-lg font-bold text-white">المستوى {levelIndex + 1}</h1>
            </div>
            <div className="text-left font-mono text-xs sm:text-sm text-[#85d852]">SCORE: {String(score).padStart(5, "0")}</div>
          </div>

          {/* مربع اللعبة متجاوب ومحمي من الاقتطاع الطولي */}
          <div dir="ltr" className="relative w-full max-w-[min(100%,50dvh)] lg:max-w-[80dvh] aspect-square mx-auto overflow-hidden rounded-xl bg-[#98a883] border-[4px] sm:border-[6px] border-[#36422d] shrink-0">
            <div className="absolute inset-0 grid opacity-15 pointer-events-none" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}>
              {Array.from({ length: SIZE * SIZE }).map((_, i) => <div key={i} className="border-[0.5px] border-[#000]" />)}
            </div>
            <div className="absolute inset-0 grid p-[2px]" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}>
              {Array.from({ length: SIZE * SIZE }).map((_, i) => {
                const x = i % SIZE; const y = Math.floor(i / SIZE); const k = keyOf(x, y);
                const segment = snakeMap.get(k); const isWall = wallSet.has(k); const isFood = food.x === x && food.y === y;
                return (
                  <div key={k} className="relative p-[5%]">
                    {isWall && <div className="w-full h-full bg-[#2a3322] rounded-[10%] shadow-sm" />}
                    {isFood && <motion.div className="w-full h-full rounded-full bg-[#182112]" animate={{ scale: [0.7, 1, 0.7] }} transition={{ duration: 0.8, repeat: Infinity }} />}
                    {segment !== undefined && (
                      <div className={`w-full h-full bg-[#11180f] ${segment === 0 ? "rounded-[30%]" : "rounded-[15%] opacity-90"}`}>
                        {segment === 0 && (
                          <div className="w-full h-full flex justify-around items-start pt-[20%] px-[15%]">
                            <i className="w-[20%] aspect-square rounded-full bg-[#98a883]" /><i className="w-[20%] aspect-square rounded-full bg-[#98a883]" />
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
              {(!isMoving && appState === "playing") && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#98a883]/60 flex items-center justify-center z-10">
                   <p className="bg-[#11180f] text-[#85d852] px-4 py-2 rounded-lg font-bold animate-pulse text-sm sm:text-base">استعد واضغط للبدء</p>
                 </motion.div>
              )}
              {appState !== "playing" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#98a883]/90 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-[#11180f] p-4 text-center">
                  {appState === "paused" && <><Pause size={40} className="mb-2"/><h2 className="text-2xl font-black">إيقاف مؤقت</h2></>}
                  {appState === "gameover" && <><RotateCcw size={40} className="mb-2"/><h2 className="text-2xl font-black text-red-900">انتهت اللعبة</h2></>}
                  {appState === "cleared" && (
                    <>
                      <Trophy size={40} className="mb-3 text-yellow-600"/>
                      <h2 className="text-2xl font-black mb-3">مرحلة مكتملة!</h2>
                      <div className="flex gap-2 justify-center mb-3" dir="ltr">{renderStars(earnedStars, true)}</div>
                      <div className="flex gap-3 mt-2">
                        <button onClick={() => startLevel(levelIndex)} className="px-4 py-2 bg-[#2a3322] text-[#98a883] rounded-lg font-bold text-sm">إعادة</button>
                        <button onClick={() => startLevel(levelIndex + 1)} className="px-6 py-2 bg-[#11180f] text-[#85d852] rounded-lg font-bold text-sm">التالي</button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-3 sm:mt-4 px-2 flex items-center gap-3 text-[#a3b398] shrink-0">
            <span className="text-[10px] sm:text-xs font-bold font-mono min-w-[40px]">TARGET</span>
            <div className="flex-1 h-2 rounded-full bg-[#2d3a29] overflow-hidden">
              <motion.div className="h-full bg-[#85d852]" animate={{ width: `${Math.min(100, (levelFood / targetFood) * 100)}%` }} />
            </div>
            <span className="text-[10px] sm:text-xs font-bold font-mono">{levelFood}/{targetFood}</span>
          </div>
        </section>

        {/* لوحة التحكم (تظهر في الأسفل على الجوال) */}
        <aside className="w-full lg:w-[320px] shrink-0 rounded-[1.5rem] bg-[#222a20] p-4 sm:p-5 shadow-lg border border-[#313f2d] flex flex-col justify-center gap-4">
          <div className="flex justify-between items-center border-b border-[#313f2d] pb-2 sm:pb-3">
            <div className="flex items-center gap-2">
              <PixelSnakeIcon className="w-6 h-6 text-[#85d852]" />
              <h2 className="text-base sm:text-lg font-bold text-white">التحكم</h2>
            </div>
            <button onClick={() => setSound(!sound)} className="p-2 rounded-xl bg-[#313f2d] text-white active:scale-95"><Volume2 size={18} opacity={sound?1:0.3}/></button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => startLevel(levelIndex)} className="rounded-xl bg-[#313f2d] p-2.5 sm:p-3 flex justify-center text-white active:scale-95"><RotateCcw size={18} /></button>
            <button onClick={() => { if(appState === "playing") setAppState("paused"); else if(appState==="paused") setAppState("playing"); }} className="rounded-xl bg-[#85d852] text-black font-bold flex items-center justify-center gap-2 active:scale-95">
              {appState === "playing" ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </div>
          
          <div dir="ltr" className="mx-auto w-40 sm:w-48 grid grid-cols-3 gap-1.5 sm:gap-2 mt-2 sm:mt-4">
            <span /><Control icon={<ArrowUp />} onClick={() => applyDirection(DIRS.up)} /><span />
            <Control icon={<ArrowLeft />} onClick={() => applyDirection(DIRS.left)} />
            <Control icon={<ArrowDown />} onClick={() => applyDirection(DIRS.down)} />
            <Control icon={<ArrowRight />} onClick={() => applyDirection(DIRS.right)} />
          </div>
          <div className="text-[9px] sm:text-[10px] text-gray-500 text-center mt-1 sm:mt-2">حقوق النشر والتطوير © لمنصة رِيشة</div>
        </aside>
      </div>
    </main>
  );
}

function Control({ icon, onClick }) {
  return (
    <button onPointerDown={(e) => { e.preventDefault(); onClick(); }} className="aspect-square rounded-xl sm:rounded-2xl bg-[#313f2d] hover:bg-[#3d4f38] text-white grid place-items-center active:scale-95 touch-manipulation border-b-4 border-[#1a2118] active:border-b-0 active:translate-y-1 transition-all">
      {React.cloneElement(icon, { size: 24, className: "sm:w-7 sm:h-7" })}
    </button>
  );
}

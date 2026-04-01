"use client";

import { useEffect, useRef, useState } from "react";
import GUI from "lil-gui";
import { Music, Trash2, Palette, Settings } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface Eye {
  x: number;
  y: number;
  radius: number;
  pupilRadius: number;
  pupilOffsetX: number;
  pupilOffsetY: number;
}

interface Shape {
  points: Point[];
  color: string;
  eyes: Eye[];
  isComplete: boolean;
}

const ColorModes = {
  Pastel: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
  Vibrant: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'],
  Grayscale: ['#333333', '#666666', '#999999', '#cccccc', '#eeeeee'],
};

export default function GraffitiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useState({
    colorMode: 'Pastel' as keyof typeof ColorModes,
    backgroundMode: 'Meme',
    lineWidth: 10,
    shadowBlur: 15,
    eyeSizeBase: 20,
    pupilSizeBase: 8,
    jiggleAmount: 10,
    gravityMultiplier: 2,
    musicVolume: 0.5,
  });
  
  const [isHelpVisible, setIsHelpVisible] = useState(true);
  const [isTweaksVisible, setIsTweaksVisible] = useState(true);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [colorModeName, setColorModeName] = useState('Pastel');
  
  const shapesRef = useRef<Shape[]>([]);
  const currentPathRef = useRef<Shape | null>(null);
  const isDrawingRef = useRef(false);
  const tiltRef = useRef({ x: 0, y: 0 });
  const shakeIntensityRef = useRef(0);
  const lastShakeTimeRef = useRef(0);
  const lastAccRef = useRef<{x: number | null, y: number | null, z: number | null}>({ x: 0, y: 0, z: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const guiRef = useRef<GUI | null>(null);

  // Initialize Canvas & Event Listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Audio setup
    audioRef.current = new Audio("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
    audioRef.current.loop = true;

    return () => {
      window.removeEventListener('resize', resize);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (guiRef.current) {
        guiRef.current.destroy();
      }
    };
  }, []);

  // Initialize GUI
  useEffect(() => {
    if (guiRef.current) guiRef.current.destroy();

    const gui = new GUI({ title: 'Tweaks', container: document.getElementById('gui-container') || undefined });
    guiRef.current = gui;
    
    // We need a mutable object for lil-gui to bind to
    const guiParams = { ...params };

    gui.add(guiParams, 'colorMode', ['Pastel', 'Vibrant', 'Grayscale']).name('Palette').onChange((v: string) => {
      setParams(p => ({ ...p, colorMode: v as keyof typeof ColorModes }));
      setColorModeName(v);
    });
    gui.add(guiParams, 'backgroundMode', ['Meme', 'Solid']).name('Background').onChange((v: string) => {
        setParams(p => ({ ...p, backgroundMode: v }));
    });
    gui.add(guiParams, 'lineWidth', 1, 30).name('Line Width').onChange((v: number) => setParams(p => ({ ...p, lineWidth: v })));
    gui.add(guiParams, 'shadowBlur', 0, 50).name('Shadow Blur').onChange((v: number) => setParams(p => ({ ...p, shadowBlur: v })));
    gui.add(guiParams, 'eyeSizeBase', 10, 50).name('Eye Size').onChange((v: number) => setParams(p => ({ ...p, eyeSizeBase: v })));
    gui.add(guiParams, 'jiggleAmount', 0, 50).name('Jiggle').onChange((v: number) => setParams(p => ({ ...p, jiggleAmount: v })));
    gui.add(guiParams, 'gravityMultiplier', 0.1, 10).name('Gravity').onChange((v: number) => setParams(p => ({ ...p, gravityMultiplier: v })));
    
    // Hide GUI initially if tweaks are hidden
    gui.domElement.style.display = isTweaksVisible ? 'block' : 'none';

  }, [isTweaksVisible]); // Re-init on visibility toggle isn't efficient but simple for now. Better: just toggle display.

  // Helper Functions
  const getRandomColor = () => {
    const palette = ColorModes[params.colorMode];
    return palette[Math.floor(Math.random() * palette.length)];
  };

  const generateEyes = (shape: Shape) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shape.points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const eyeCount = Math.random() > 0.8 ? 3 : (Math.random() > 0.2 ? 2 : 1);

    for (let i = 0; i < eyeCount; i++) {
      const offsetX = (Math.random() - 0.5) * (maxX - minX) * 0.5;
      const offsetY = (Math.random() - 0.5) * (maxY - minY) * 0.5;
      const sizeMultiplier = 0.5 + Math.random() * 1.0;

      shape.eyes.push({
        x: centerX + offsetX,
        y: centerY + offsetY,
        radius: params.eyeSizeBase * sizeMultiplier,
        pupilRadius: params.pupilSizeBase * sizeMultiplier,
        pupilOffsetX: 0,
        pupilOffsetY: 0
      });
    }
  };

  // Drawing Logic
  const startDrawing = (e: React.PointerEvent) => {
    setIsHelpVisible(false);
    requestSensorPermissions();
    
    isDrawingRef.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentPathRef.current = {
      points: [{ x, y }],
      color: getRandomColor(),
      eyes: [],
      isComplete: false
    };
    shapesRef.current.push(currentPathRef.current);
  };

  const drawPath = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !currentPathRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    currentPathRef.current.points.push({ 
        x: e.clientX - rect.left, 
        y: e.clientY - rect.top 
    });
  };

  const endDrawing = () => {
    if (!isDrawingRef.current || !currentPathRef.current) return;
    isDrawingRef.current = false;
    currentPathRef.current.isComplete = true;

    if (currentPathRef.current.points.length > 5) {
      generateEyes(currentPathRef.current);
    } else {
      shapesRef.current.pop();
    }
    currentPathRef.current = null;
  };

  // Sensors
  const requestSensorPermissions = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && (DeviceOrientationEvent as any).requestPermission) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }
    if (typeof DeviceMotionEvent !== 'undefined' && (DeviceMotionEvent as any).requestPermission) {
      (DeviceMotionEvent as any).requestPermission().catch(console.error);
    }
  };

  useEffect(() => {
    const supportsDeviceOrientation = typeof DeviceOrientationEvent !== "undefined";

    const handleOrientation = (e: DeviceOrientationEvent) => {
        if (e.gamma !== null && e.beta !== null) {
            tiltRef.current = { x: e.gamma, y: e.beta };
        }
    };
    
    const handleMotion = (e: DeviceMotionEvent) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        
        const last = lastAccRef.current;
        if (last.x !== null) {
            const deltaX = Math.abs((last.x || 0) - (acc.x || 0));
            const deltaY = Math.abs((last.y || 0) - (acc.y || 0));
            const deltaZ = Math.abs((last.z || 0) - (acc.z || 0));
            
            if (deltaX + deltaY + deltaZ > 15) {
                const now = Date.now();
                if (now - lastShakeTimeRef.current > 50) {
                    shakeIntensityRef.current = 1.0;
                    lastShakeTimeRef.current = now;
                }
            }
        }
        lastAccRef.current = { x: acc.x, y: acc.y, z: acc.z };
    };

    const handleMouseMove = (e: MouseEvent) => {
        // Fallback for desktop
        if (!supportsDeviceOrientation) {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            tiltRef.current = {
                x: (e.clientX - cx) / cx * 45,
                y: (e.clientY - cy) / cy * 45
            };
        }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
        window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Shake logic
        shakeIntensityRef.current *= 0.9;
        if (shakeIntensityRef.current < 0.01) shakeIntensityRef.current = 0;
        
        const jiggleX = (Math.random() - 0.5) * params.jiggleAmount * 2 * shakeIntensityRef.current;
        const jiggleY = (Math.random() - 0.5) * params.jiggleAmount * 2 * shakeIntensityRef.current;

        shapesRef.current.forEach(shape => {
            if (shape.points.length === 0) return;

            ctx.save();
            ctx.translate(jiggleX, jiggleY);
            
            ctx.beginPath();
            ctx.moveTo(shape.points[0].x, shape.points[0].y);

            for (let i = 1; i < shape.points.length - 2; i++) {
                const xc = (shape.points[i].x + shape.points[i + 1].x) / 2;
                const yc = (shape.points[i].y + shape.points[i + 1].y) / 2;
                ctx.quadraticCurveTo(shape.points[i].x, shape.points[i].y, xc, yc);
            }

            if (shape.points.length > 2) {
                const last = shape.points.length - 1;
                ctx.quadraticCurveTo(
                    shape.points[last - 1].x, shape.points[last - 1].y,
                    shape.points[last].x, shape.points[last].y
                );
            }

            if (shape.isComplete) {
                ctx.closePath();
                ctx.fillStyle = shape.color;
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = params.shadowBlur;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.fill();
                
                ctx.lineWidth = params.lineWidth;
                ctx.strokeStyle = '#333';
                ctx.stroke();

                // Eyes
                shape.eyes.forEach(eye => {
                    const maxOffset = eye.radius - eye.pupilRadius - 3;
                    const targetOffsetX = (tiltRef.current.x / 90) * maxOffset * params.gravityMultiplier;
                    const targetOffsetY = (tiltRef.current.y / 90) * maxOffset * params.gravityMultiplier;
                    
                    eye.pupilOffsetX += (targetOffsetX - eye.pupilOffsetX) * 0.1;
                    eye.pupilOffsetY += (targetOffsetY - eye.pupilOffsetY) * 0.1;

                    // Draw Eye
                    ctx.shadowColor = 'transparent';
                    ctx.beginPath();
                    ctx.arc(eye.x, eye.y, eye.radius, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#333';
                    ctx.stroke();

                    // Pupil
                    let px = eye.pupilOffsetX;
                    let py = eye.pupilOffsetY;
                    const dist = Math.sqrt(px*px + py*py);
                    if (dist > maxOffset) {
                        px = (px / dist) * maxOffset;
                        py = (py / dist) * maxOffset;
                    }

                    ctx.beginPath();
                    ctx.arc(eye.x + px, eye.y + py, eye.pupilRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#333';
                    ctx.fill();
                });
            } else {
                ctx.shadowColor = 'transparent';
                ctx.lineWidth = params.lineWidth;
                ctx.strokeStyle = shape.color;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
            ctx.restore();
        });

        animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [params]); // Re-bind when params change to pick up new values in loop

  // UI Handlers
  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (musicPlaying) {
        audioRef.current.pause();
    } else {
        audioRef.current.volume = params.musicVolume;
        audioRef.current.play().catch(console.error);
    }
    setMusicPlaying(!musicPlaying);
  };

  const clearCanvas = () => {
    shapesRef.current = [];
  };

  const cycleColorMode = () => {
    const modes = Object.keys(ColorModes) as (keyof typeof ColorModes)[];
    const nextIdx = (modes.indexOf(params.colorMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setParams(p => ({ ...p, colorMode: nextMode }));
    setColorModeName(nextMode);
    
    // Update GUI display
    if (guiRef.current) {
        guiRef.current.controllersRecursive().forEach(c => c.updateDisplay());
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
        {/* Background */}
        <div 
            className="absolute inset-0 -z-10 pointer-events-none"
            style={{
                background: params.backgroundMode === 'Meme' 
                ? `
                    radial-gradient(1200px 800px at 15% 15%, rgba(255, 0, 200, 0.25), transparent 55%),
                    radial-gradient(900px 700px at 90% 10%, rgba(0, 255, 255, 0.22), transparent 55%),
                    radial-gradient(900px 700px at 70% 85%, rgba(255, 255, 0, 0.18), transparent 55%),
                    linear-gradient(135deg, #0b1020 0%, #111827 40%, #0b1020 100%)
                  `
                : '#f0f0f0'
            }}
        />

        {/* UI Layer */}
        <div className="absolute top-5 left-5 z-10 flex flex-col gap-3 pointer-events-none">
            <h1 className="text-4xl font-black text-white drop-shadow-[2px_2px_0px_#000] mb-2 pointer-events-auto select-none"
                style={{ fontFamily: '"Comic Sans MS", cursive' }}>
                Graffiti Monster
            </h1>
            
            <div className="flex flex-col gap-3 items-start pointer-events-auto">
                <button 
                    onClick={cycleColorMode}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-400 text-white font-bold border-4 border-black rounded-full shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all hover:brightness-110"
                >
                    <Palette size={20} />
                    PALETTE: {colorModeName.toUpperCase()}
                </button>

                <button 
                    onClick={clearCanvas}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white font-bold border-4 border-black rounded-full shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all hover:brightness-110"
                >
                    <Trash2 size={20} />
                    NUKE CANVAS
                </button>

                <button 
                    onClick={toggleMusic}
                    className={`flex items-center gap-2 px-4 py-2 ${musicPlaying ? 'bg-yellow-400 text-black' : 'bg-gray-600 text-white'} font-bold border-4 border-black rounded-full shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all hover:brightness-110`}
                >
                    <Music size={20} />
                    MUSIC: {musicPlaying ? 'ON' : 'OFF'}
                </button>

                <button 
                    onClick={() => setIsTweaksVisible(!isTweaksVisible)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white font-bold border-4 border-black rounded-full shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all hover:brightness-110"
                >
                    <Settings size={20} />
                    TWEAKS: {isTweaksVisible ? 'ON' : 'OFF'}
                </button>
            </div>
        </div>

        {/* Help Overlay */}
        {isHelpVisible && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                 onClick={() => setIsHelpVisible(false)}>
                <div className="bg-white border-4 border-black p-8 rounded-2xl shadow-[8px_8px_0px_#fff] max-w-md text-center transform rotate-1">
                    <h2 className="text-3xl font-black mb-4">HOW 2 PLAY</h2>
                    <ul className="text-left space-y-3 font-bold text-lg mb-6">
                        <li className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400 border-2 border-black flex items-center justify-center">1</span>
                            Draw shapes on screen
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-red-400 border-2 border-black flex items-center justify-center">2</span>
                            Monsters spawn automatically
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-green-300 to-blue-400 border-2 border-black flex items-center justify-center">3</span>
                            Tilt device to move eyes
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-300 to-orange-400 border-2 border-black flex items-center justify-center">4</span>
                            SHAKE to jiggle!
                        </li>
                    </ul>
                    <button className="px-8 py-3 bg-black text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform">
                        OK LET'S GO
                    </button>
                </div>
            </div>
        )}

        {/* Canvas */}
        <canvas
            ref={canvasRef}
            className="block w-full h-full cursor-crosshair touch-none"
            onPointerDown={startDrawing}
            onPointerMove={drawPath}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
        />

        {/* GUI Container */}
        <div 
            id="gui-container" 
            className="absolute top-5 right-5 z-10"
            style={{ display: isTweaksVisible ? 'block' : 'none' }}
        />
    </div>
  );
}

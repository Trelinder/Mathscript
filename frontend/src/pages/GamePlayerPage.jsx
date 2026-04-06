// Tech-themed wallpapers removed — external URLs violate CSP

// ... existing code above ...

                {/* ── UPLINK / COMPILE column ── */}
                <div className="w-full bg-slate-800 border-t-2 border-slate-700 py-6 flex justify-center items-center relative z-20" style={{ flex:1, minWidth:0 }}>
                  <button
                    onClick={handleManualCompile}
                    className="w-3/4 max-w-sm cursor-pointer transition-all hover:scale-105 active:scale-95 bg-blue-600 hover:bg-blue-500 py-4 rounded-xl shadow-[0_6px_0_rgb(30,58,138)] active:shadow-none active:translate-y-[6px] flex flex-col items-center justify-center border-2 border-blue-400 relative"
                  >
                    <span className="text-4xl mb-2">💻 👨🏽‍💻</span>
                    <span className="text-white font-black tracking-widest text-sm drop-shadow-md">COMPILE TO CASH</span>

                    {/* Bouncing TAP indicator */}
                    <span className="absolute -top-3 -right-3 bg-yellow-400 text-yellow-900 text-xs font-black px-3 py-1 rounded-full shadow-lg animate-bounce pointer-events-none border-2 border-yellow-200 z-30">
                      TAP TO SELL!
                    </span>
                  </button>
                </div>

// ... existing code below ...
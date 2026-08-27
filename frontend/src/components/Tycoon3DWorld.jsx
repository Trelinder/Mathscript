import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei'
import * as THREE from 'three'
import './Tycoon3DWorld.css'

const FLOOR_HEIGHT = 1.35
const TOWER_WIDTH = 7.4
const TOWER_DEPTH = 4.2
const MAX_TOKENS = 7

class SceneErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: false }
    }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children
    }
}

function CameraRig({ isMobile }) {
    const { camera } = useThree()

    useEffect(() => {
        camera.position.set(isMobile ? 11.5 : 10.5, isMobile ? 7.8 : 6.8, isMobile ? 16.5 : 14.5)
        camera.lookAt(0, 4.1, 0)
        camera.updateProjectionMatrix()
    }, [camera, isMobile])

    return null
}

function Worker({ color, active, index, reducedMotion }) {
    const workerRef = useRef(null)
    const phase = index * 1.7

    useFrame(({ clock }) => {
        if (!workerRef.current || reducedMotion || !active) return
        const time = clock.elapsedTime * 2.2 + phase
        workerRef.current.position.y = 0.04 + Math.sin(time) * 0.035
        workerRef.current.rotation.y = Math.sin(time * 0.45) * 0.1
    })

    return (
        <group ref={workerRef} position={[-0.2 + index * 0.42, 0.04, 0.58]}>
            <mesh position={[0, 0.42, 0]} castShadow>
                <capsuleGeometry args={[0.12, 0.28, 4, 8]} />
                <meshStandardMaterial color={active ? color : '#263246'} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.76, 0]} castShadow>
                <sphereGeometry args={[0.16, 12, 8]} />
                <meshStandardMaterial color={active ? '#f4c9a7' : '#334155'} roughness={0.72} />
            </mesh>
            <mesh position={[0, 0.79, 0.12]}>
                <boxGeometry args={[0.24, 0.06, 0.025]} />
                <meshStandardMaterial color={active ? '#67e8f9' : '#475569'} emissive={active ? '#0891b2' : '#000000'} emissiveIntensity={1.2} />
            </mesh>
        </group>
    )
}

function Workstation({ color, active, level, workerCount, reducedMotion }) {
    const screenRef = useRef(null)

    useFrame(({ clock }) => {
        if (!screenRef.current || reducedMotion || !active) return
        screenRef.current.material.emissiveIntensity = 1.4 + Math.sin(clock.elapsedTime * 3.4) * 0.55
    })

    const visibleWorkers = Math.min(3, Math.max(1, workerCount))
    return (
        <group position={[0.55, 0.12, -0.18]}>
            <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.75, 0.16, 0.82]} />
                <meshStandardMaterial color={active ? '#223047' : '#111827'} metalness={0.55} roughness={0.42} />
            </mesh>
            <mesh position={[0, 0.72, -0.22]} castShadow>
                <boxGeometry args={[0.88, 0.58, 0.12]} />
                <meshStandardMaterial color="#0b1220" metalness={0.7} roughness={0.25} />
            </mesh>
            <mesh ref={screenRef} position={[0, 0.72, -0.151]}>
                <planeGeometry args={[0.7, 0.4]} />
                <meshStandardMaterial color={active ? color : '#1e293b'} emissive={active ? color : '#000000'} emissiveIntensity={active ? 1.8 : 0} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.42, -0.2]}>
                <boxGeometry args={[0.08, 0.34, 0.08]} />
                <meshStandardMaterial color="#64748b" metalness={0.8} />
            </mesh>
            {Array.from({ length: visibleWorkers }, (_, index) => (
                <Worker key={index} color={color} active={active} index={index} reducedMotion={reducedMotion} />
            ))}
            {level >= 25 && (
                <mesh position={[1.12, 0.58, -0.28]} castShadow>
                    <cylinderGeometry args={[0.2, 0.26, 0.92, 12]} />
                    <meshStandardMaterial color="#172033" emissive={color} emissiveIntensity={0.75} metalness={0.75} roughness={0.28} />
                </mesh>
            )}
        </group>
    )
}

function TokenPile({ amount, color }) {
    const count = amount <= 0 ? 0 : Math.min(MAX_TOKENS, Math.max(1, Math.ceil(Math.log10(amount + 1) * 2)))
    return (
        <group position={[-2.45, 0.2, 0.62]}>
            {Array.from({ length: count }, (_, index) => (
                <mesh key={index} position={[(index % 3) * 0.28, Math.floor(index / 3) * 0.27, (index % 2) * 0.16]} rotation={[0, index * 0.22, 0]} castShadow>
                    <boxGeometry args={[0.22, 0.22, 0.22]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} metalness={0.4} roughness={0.25} />
                </mesh>
            ))}
        </group>
    )
}

function DepartmentFloor({ department, selected, onSelect, reducedMotion }) {
    const groupRef = useRef(null)
    const active = department.level > 0
    const color = active ? department.color : '#27445f'

    useFrame(({ clock }) => {
        if (!groupRef.current || reducedMotion || !active) return
        const pulse = 1 + Math.sin(clock.elapsedTime * 1.8 + department.index) * 0.035
        groupRef.current.children[0].material.emissiveIntensity = selected ? 0.68 * pulse : 0.18 * pulse
    })

    return (
        <group
            ref={groupRef}
            position={[0.55, department.index * FLOOR_HEIGHT, 0]}
            onClick={(event) => {
                event.stopPropagation()
                onSelect(department.index)
            }}
            onPointerOver={(event) => {
                event.stopPropagation()
                document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => { document.body.style.cursor = 'default' }}
        >
            <mesh position={[0, 0, 0]} receiveShadow>
                <boxGeometry args={[TOWER_WIDTH, 0.16, TOWER_DEPTH]} />
                <meshStandardMaterial color={active ? '#1b3152' : '#101a2a'} emissive={color} emissiveIntensity={selected ? 0.82 : active ? 0.28 : 0.09} metalness={0.58} roughness={0.38} />
            </mesh>
            <mesh position={[0, 0.68, -TOWER_DEPTH / 2]} receiveShadow>
                <boxGeometry args={[TOWER_WIDTH, FLOOR_HEIGHT, 0.12]} />
                <meshStandardMaterial color={active ? '#172944' : '#101827'} metalness={0.3} roughness={0.74} />
            </mesh>
            <mesh position={[-TOWER_WIDTH / 2, 0.68, 0]}>
                <boxGeometry args={[0.12, FLOOR_HEIGHT, TOWER_DEPTH]} />
                <meshStandardMaterial color="#16233a" metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[TOWER_WIDTH / 2, 0.68, 0]}>
                <boxGeometry args={[0.12, FLOOR_HEIGHT, TOWER_DEPTH]} />
                <meshStandardMaterial color="#16233a" metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[0, 1.28, -2.02]}>
                <boxGeometry args={[6.6, 0.045, 0.05]} />
                <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {active ? (
                <>
                    <Workstation color={department.color} active level={department.level} workerCount={department.workerCount} reducedMotion={reducedMotion} />
                    <TokenPile amount={department.outputBin} color={department.color} />
                    <pointLight position={[0.5, 1.05, 0.4]} color={department.color} intensity={selected ? 5.5 : 2.2} distance={4.8} decay={2} />
                </>
            ) : (
                <group position={[0.5, 0.42, -0.15]}>
                    <mesh>
                        <boxGeometry args={[1.15, 0.68, 0.22]} />
                        <meshStandardMaterial color="#141c2b" metalness={0.7} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0.05, 0.13]}>
                        <torusGeometry args={[0.17, 0.055, 8, 16, Math.PI]} />
                        <meshStandardMaterial color="#475569" metalness={0.65} />
                    </mesh>
                </group>
            )}
        </group>
    )
}

function Elevator({ currentFloor, state, payload, reducedMotion }) {
    const carRef = useRef(null)
    const targetY = currentFloor < 0 ? -0.42 : currentFloor * FLOOR_HEIGHT + 0.46

    useFrame((_, delta) => {
        if (!carRef.current) return
        const speed = reducedMotion ? 20 : state === 'IDLE' ? 5 : 2.8
        carRef.current.position.y = THREE.MathUtils.damp(carRef.current.position.y, targetY, speed, delta)
    })

    return (
        <group position={[-3.92, 0, 0]}>
            <mesh position={[0, 4.05, -1.25]}>
                <boxGeometry args={[1.25, 9.8, 0.12]} />
                <meshStandardMaterial color="#080f1c" metalness={0.76} roughness={0.3} />
            </mesh>
            <mesh position={[-0.54, 4.05, -0.5]}>
                <boxGeometry args={[0.07, 9.8, 1.55]} />
                <meshStandardMaterial color="#28517a" metalness={0.82} />
            </mesh>
            <mesh position={[0.54, 4.05, -0.5]}>
                <boxGeometry args={[0.07, 9.8, 1.55]} />
                <meshStandardMaterial color="#28517a" metalness={0.82} />
            </mesh>
            <group ref={carRef} position={[0, targetY, -0.48]}>
                <mesh castShadow>
                    <boxGeometry args={[1.02, 0.82, 1.22]} />
                    <meshStandardMaterial color={state === 'IDLE' ? '#16304f' : '#14658a'} emissive="#00c8ff" emissiveIntensity={state === 'IDLE' ? 0.18 : 0.8} metalness={0.72} roughness={0.25} />
                </mesh>
                <mesh position={[0, 0, 0.616]}>
                    <planeGeometry args={[0.66, 0.46]} />
                    <meshBasicMaterial color={payload > 0 ? '#67e8f9' : '#10243b'} toneMapped={false} />
                </mesh>
            </group>
        </group>
    )
}

function CompilerCore({ state, reducedMotion }) {
    const ringsRef = useRef(null)
    const active = state !== 'IDLE'

    useFrame((_, delta) => {
        if (!ringsRef.current || reducedMotion || !active) return
        ringsRef.current.rotation.y += delta * 1.8
        ringsRef.current.rotation.x += delta * 0.45
    })

    return (
        <group position={[4.9, 0.55, -0.25]}>
            <mesh position={[0, -0.42, 0]} receiveShadow>
                <cylinderGeometry args={[1.05, 1.2, 0.28, 20]} />
                <meshStandardMaterial color="#16283a" metalness={0.8} roughness={0.3} />
            </mesh>
            <group ref={ringsRef}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.72, 0.075, 8, 28]} />
                    <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={active ? 2 : 0.45} toneMapped={false} />
                </mesh>
                <mesh rotation={[0, Math.PI / 2, 0]}>
                    <torusGeometry args={[0.5, 0.055, 8, 24]} />
                    <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={active ? 1.8 : 0.3} toneMapped={false} />
                </mesh>
            </group>
            <mesh>
                <icosahedronGeometry args={[0.24, 1]} />
                <meshStandardMaterial color="#e2fdf0" emissive="#22c55e" emissiveIntensity={active ? 3 : 0.7} toneMapped={false} />
            </mesh>
            <pointLight color="#22c55e" intensity={active ? 8 : 2} distance={5} decay={2} />
        </group>
    )
}

function WorldScene({ departments, selectedIndex, onSelect, busCurrentFloor, busState, busPayload, compilerState, isMobile, reducedMotion }) {
    const [quality, setQuality] = useState(1)
    const activeLights = quality > 0.55

    return (
        <>
            <PerformanceMonitor
                bounds={(refreshRate) => refreshRate > 90 ? [55, 80] : [35, 55]}
                onIncline={() => setQuality(1)}
                onDecline={() => setQuality(0.5)}
            />
            <CameraRig isMobile={isMobile} />
            <color attach="background" args={['#020711']} />
            <fog attach="fog" args={['#020711', 16, 34]} />
            <ambientLight intensity={0.72} />
            <hemisphereLight args={['#77d5ff', '#120822', 1.25]} />
            <directionalLight position={[7, 13, 8]} intensity={2.4} color="#dff6ff" castShadow={activeLights && !isMobile} shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-7, 7, 11]} intensity={1.8} color="#5ee7ff" />
            <Stars radius={42} depth={18} count={isMobile ? 260 : 520} factor={2.2} saturation={0.35} fade speed={reducedMotion ? 0 : 0.25} />

            <group position={[0, -0.15, 0]}>
                {departments.map((department) => (
                    <DepartmentFloor
                        key={department.id}
                        department={department}
                        selected={department.index === selectedIndex}
                        onSelect={onSelect}
                        reducedMotion={reducedMotion}
                    />
                ))}
                <Elevator currentFloor={busCurrentFloor} state={busState} payload={busPayload} reducedMotion={reducedMotion} />
                <CompilerCore state={compilerState} reducedMotion={reducedMotion} />
            </group>

            <mesh position={[0.4, -0.74, 0]} receiveShadow>
                <boxGeometry args={[13.8, 0.36, 7.8]} />
                <meshStandardMaterial color="#060d18" metalness={0.52} roughness={0.68} />
            </mesh>
            <gridHelper args={[30, 30, '#0e7490', '#10243c']} position={[0, -0.54, 0]} />
            <OrbitControls
                makeDefault
                enablePan={false}
                enableDamping={!reducedMotion}
                minDistance={9}
                maxDistance={24}
                minPolarAngle={0.72}
                maxPolarAngle={1.38}
                minAzimuthAngle={-0.85}
                maxAzimuthAngle={0.85}
                target={[0, 3.9, 0]}
            />
        </>
    )
}

function NoWebGLFallback({ onUseClassicView }) {
    return (
        <div className="tycoon-3d-fallback" role="status">
            <strong>3D mode is unavailable on this device.</strong>
            <button type="button" onClick={onUseClassicView}>Use classic view</button>
        </div>
    )
}

export default function Tycoon3DWorld({
    departments,
    coins,
    bus,
    busState,
    busPayload,
    busCurrentFloor,
    compilerState,
    onUpgradeFloor,
    onHireManager,
    onProduce,
    onUpgradeBus,
    onOpenBus,
    onUseClassicView,
    formatNumber,
    formatRate,
    isMobile,
}) {
    const firstActive = departments.findIndex((department) => department.level > 0)
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, firstActive))
    const [reducedMotion, setReducedMotion] = useState(false)

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReducedMotion(query.matches)
        update()
        query.addEventListener?.('change', update)
        return () => query.removeEventListener?.('change', update)
    }, [])

    const selected = departments[selectedIndex] ?? departments[0]
    const sceneFallback = <NoWebGLFallback onUseClassicView={onUseClassicView} />
    const statusText = useMemo(() => {
        if (!selected) return ''
        if (selected.level === 0) return `Locked. Unlock for $${formatNumber(selected.cost)}.`
        return `Level ${selected.level}. Producing ${formatRate(selected.rate)} energy per second.`
    }, [formatNumber, formatRate, selected])

    if (!selected) return sceneFallback

    return (
        <section className="tycoon-3d-shell" aria-label="Interactive 3D company tower">
            <SceneErrorBoundary fallback={sceneFallback}>
                <Canvas
                    className="tycoon-3d-canvas"
                    dpr={[1, 1.5]}
                    shadows={!isMobile}
                    frameloop={reducedMotion ? 'demand' : 'always'}
                    fallback={sceneFallback}
                    gl={{ antialias: !isMobile, alpha: false, powerPreference: 'high-performance', stencil: false }}
                    camera={{ fov: isMobile ? 48 : 42, near: 0.1, far: 80 }}
                    onPointerMissed={() => setSelectedIndex(Math.max(0, firstActive))}
                >
                    <WorldScene
                        departments={departments}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                        busCurrentFloor={busCurrentFloor}
                        busState={busState}
                        busPayload={busPayload}
                        compilerState={compilerState}
                        isMobile={isMobile}
                        reducedMotion={reducedMotion}
                    />
                </Canvas>
            </SceneErrorBoundary>

            <div className="tycoon-3d-stage-label" aria-hidden="true">
                <span>LIVE TOWER</span>
            </div>

            <nav className="tycoon-3d-floor-nav" aria-label="Tower departments">
                {departments.map((department) => (
                    <button
                        key={department.id}
                        type="button"
                        aria-label={`${department.name}, ${department.level > 0 ? `level ${department.level}` : 'locked'}`}
                        aria-pressed={department.index === selectedIndex}
                        onClick={() => setSelectedIndex(department.index)}
                        style={{ '--department-color': department.color }}
                    >
                        <span>{department.index + 1}</span>
                    </button>
                ))}
            </nav>

            <aside className="tycoon-3d-inspector" aria-live="polite">
                <div className="tycoon-3d-inspector-heading">
                    <div>
                        <span>DEPARTMENT {selected.index + 1}</span>
                        <strong style={{ color: selected.color }}>{selected.short}</strong>
                    </div>
                    <button type="button" className="tycoon-3d-classic" onClick={onUseClassicView} aria-label="Switch to classic two-dimensional view">2D</button>
                </div>
                <p>{statusText}</p>
                <div className="tycoon-3d-metrics">
                    <span><small>OUTPUT</small>{formatRate(selected.rate)}/s</span>
                    <span><small>WAITING</small>{formatNumber(selected.outputBin)}</span>
                    <span><small>TEAM</small>{selected.workerCount}</span>
                </div>
                <div className="tycoon-3d-actions">
                    {selected.level > 0 && (
                        <button type="button" onClick={() => onProduce(selected.index)} aria-label={`Produce energy in ${selected.short}`}>PRODUCE</button>
                    )}
                    <button
                        type="button"
                        className="primary"
                        disabled={!selected.canAfford}
                        onClick={() => onUpgradeFloor(selected.index)}
                    >
                        {selected.level > 0 ? `LEVEL ${selected.level + 1}` : 'UNLOCK'} · ${formatNumber(selected.cost)}
                    </button>
                    {selected.level > 0 && !selected.managed && (
                        <button type="button" disabled={coins < selected.managerCost} onClick={() => onHireManager(selected.index)}>
                            HIRE · ${formatNumber(selected.managerCost)}
                        </button>
                    )}
                </div>
            </aside>

            <div className="tycoon-3d-logistics">
                <button type="button" onClick={onOpenBus} aria-label="Open elevator controls">
                    <span>LOGISTICS LV {bus.capacityLevel}</span>
                    <strong>{bus.capacity} RC</strong>
                </button>
                <button type="button" disabled={coins < bus.capacityCost} onClick={onUpgradeBus}>
                    UPGRADE · ${formatNumber(bus.capacityCost)}
                </button>
            </div>
        </section>
    )
}
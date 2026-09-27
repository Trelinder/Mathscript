import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
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

function CameraRig({ isMobile, highestBuiltIndex }) {
    const { camera } = useThree()

    useEffect(() => {
        const focusHeight = Math.max(0.8, (highestBuiltIndex + 1) * FLOOR_HEIGHT / 2)
        const distance = Math.min(1, (highestBuiltIndex + 1) / 5)
        camera.position.set(6 + distance * 4.5, focusHeight + 3 + distance * 2, 8 + distance * 6.5)
        camera.lookAt(0, focusHeight, 0)
        camera.updateProjectionMatrix()
    }, [camera, highestBuiltIndex, isMobile])

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

function ServerRack({ color, active, position }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.57, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.76, 1.1, 0.68]} />
                <meshStandardMaterial color={active ? '#3a4a4d' : '#2a3437'} metalness={0.45} roughness={0.68} />
            </mesh>
            <mesh position={[0, 0.57, 0.35]}>
                <boxGeometry args={[0.58, 0.9, 0.035]} />
                <meshStandardMaterial color="#151d20" metalness={0.6} roughness={0.42} />
            </mesh>
            {Array.from({ length: 4 }, (_, index) => (
                <mesh key={index} position={[-0.14, 0.87 - index * 0.2, 0.374]}>
                    <boxGeometry args={[0.035, 0.045, 0.018]} />
                    <meshStandardMaterial color={active ? color : '#52605d'} emissive={active ? color : '#000000'} emissiveIntensity={active ? 0.65 : 0} />
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
                <meshStandardMaterial color={active ? '#344347' : '#293235'} emissive={color} emissiveIntensity={selected ? 0.54 : active ? 0.18 : 0.04} metalness={0.34} roughness={0.66} />
            </mesh>
            <mesh position={[0, 0.68, -TOWER_DEPTH / 2]} receiveShadow>
                <boxGeometry args={[TOWER_WIDTH, FLOOR_HEIGHT, 0.12]} />
                <meshStandardMaterial color={active ? '#46514d' : '#393f3c'} metalness={0.12} roughness={0.92} />
            </mesh>
            <mesh position={[-TOWER_WIDTH / 2, 0.68, 0]}>
                <boxGeometry args={[0.12, FLOOR_HEIGHT, TOWER_DEPTH]} />
                <meshStandardMaterial color="#4d5147" metalness={0.22} roughness={0.82} />
            </mesh>
            <mesh position={[TOWER_WIDTH / 2, 0.68, 0]}>
                <boxGeometry args={[0.12, FLOOR_HEIGHT, TOWER_DEPTH]} />
                <meshStandardMaterial color="#4d5147" metalness={0.22} roughness={0.82} />
            </mesh>
            <mesh position={[0, 1.28, -2.02]}>
                <boxGeometry args={[6.6, 0.045, 0.05]} />
                <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {[-3.08, -2.12, 2.55].map((x) => (
                <ServerRack key={x} color={department.color} active={active} position={[x, 0.12, -1.18]} />
            ))}
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
    const screenRef = useRef(null)
    const active = state !== 'IDLE'

    useFrame((_, delta) => {
        if (!screenRef.current || reducedMotion || !active) return
        screenRef.current.material.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.004) * 0.35
    })

    return (
        <group position={[4.9, 0.1, -0.25]}>
            <mesh position={[0, -0.16, 0]} receiveShadow>
                <boxGeometry args={[1.45, 0.28, 1.1]} />
                <meshStandardMaterial color="#403c32" metalness={0.18} roughness={0.82} />
            </mesh>
            <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.05, 1.55, 0.82]} />
                <meshStandardMaterial color="#36464a" metalness={0.38} roughness={0.62} />
            </mesh>
            <mesh position={[0, 0.78, 0.425]}>
                <boxGeometry args={[0.72, 1.18, 0.035]} />
                <meshStandardMaterial color="#172327" metalness={0.52} roughness={0.35} />
            </mesh>
            <mesh ref={screenRef} position={[0, 1.06, 0.45]}>
                <planeGeometry args={[0.52, 0.32]} />
                <meshStandardMaterial color="#5fc8bd" emissive={active ? '#40d1bb' : '#256e69'} emissiveIntensity={active ? 1.2 : 0.35} toneMapped={false} />
            </mesh>
            {Array.from({ length: 5 }, (_, index) => (
                <mesh key={index} position={[0, 0.58 - index * 0.15, 0.45]}>
                    <boxGeometry args={[0.42, 0.035, 0.025]} />
                    <meshStandardMaterial color="#687574" metalness={0.5} roughness={0.5} />
                </mesh>
            ))}
            <pointLight color="#4ec7b4" intensity={active ? 3.5 : 1} distance={4} decay={2} />
        </group>
    )
}

function BedrockBackdrop() {
    return (
        <group>
            <mesh position={[0.4, 4.2, -4.55]} receiveShadow>
                <boxGeometry args={[15, 10, 1.8]} />
                <meshStandardMaterial color="#604735" roughness={1} />
            </mesh>
            {Array.from({ length: 9 }, (_, index) => (
                <mesh key={index} position={[0.4, -0.55 + index * 1.12, -3.62]} receiveShadow>
                    <boxGeometry args={[14.9 - (index % 3) * 0.25, 0.1, 0.08]} />
                    <meshStandardMaterial color={index % 2 === 0 ? '#795a3f' : '#49382d'} roughness={1} />
                </mesh>
            ))}
        </group>
    )
}

function WorldScene({ departments, selectedIndex, onSelect, busCurrentFloor, busState, busPayload, compilerState, isMobile, reducedMotion }) {
    const [quality, setQuality] = useState(1)
    const activeLights = quality > 0.55
    const highestBuiltIndex = departments.reduce((highest, department) => department.level > 0 ? department.index : highest, 0)
    const focusHeight = Math.max(0.8, (highestBuiltIndex + 1) * FLOOR_HEIGHT / 2)

    return (
        <>
            <PerformanceMonitor
                bounds={(refreshRate) => refreshRate > 90 ? [55, 80] : [35, 55]}
                onIncline={() => setQuality(1)}
                onDecline={() => setQuality(0.5)}
            />
            <CameraRig isMobile={isMobile} highestBuiltIndex={highestBuiltIndex} />
            <color attach="background" args={['#30261f']} />
            <fog attach="fog" args={['#30261f', 19, 38]} />
            <ambientLight intensity={0.72} />
            <hemisphereLight args={['#c3c5a2', '#3f2f25', 1.15]} />
            <directionalLight position={[7, 13, 8]} intensity={2.1} color="#f2d6a0" castShadow={activeLights && !isMobile} shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-7, 7, 11]} intensity={1.15} color="#73b8a8" />

            <BedrockBackdrop />
            <group position={[0, -0.15, 0]}>
                {departments.filter((department) => department.level > 0).map((department) => (
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
                <meshStandardMaterial color="#574333" metalness={0.08} roughness={0.96} />
            </mesh>
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
                target={[0, focusHeight, 0]}
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
    const nextUnbuiltIndex = departments.findIndex((department) => department.level === 0)
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
        <section className="tycoon-3d-shell" aria-label="Interactive 3D underground data center">
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
                <span>UNDERGROUND DATA CENTER</span>
                <small>SUBLEVEL OPERATIONS</small>
            </div>

            <nav className="tycoon-3d-floor-nav" aria-label="Data center levels">
                {departments.filter((department) => department.level > 0 || department.index === nextUnbuiltIndex).map((department) => (
                    <button
                        key={department.id}
                        type="button"
                        aria-label={department.level > 0 ? `${department.name}, level ${department.level}` : 'Build next server room'}
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
                        <span>SUBLEVEL {selected.index + 1}</span>
                        <strong style={{ color: selected.color }}>{selected.level > 0 ? selected.short : 'NEW SERVER ROOM'}</strong>
                    </div>
                    <button type="button" className="tycoon-3d-classic" onClick={onUseClassicView} aria-label="Switch to classic two-dimensional view">2D</button>
                </div>
                <p>{statusText}</p>
                {selected.level > 0 && <div className="tycoon-3d-metrics">
                    <span><small>OUTPUT</small>{formatRate(selected.rate)}/s</span>
                    <span><small>WAITING</small>{formatNumber(selected.outputBin)}</span>
                    <span><small>TEAM</small>{selected.workerCount}</span>
                </div>}
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
                        {selected.level > 0 ? `LEVEL ${selected.level + 1}` : 'BUILD'} · ${formatNumber(selected.cost)}
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
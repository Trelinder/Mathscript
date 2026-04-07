import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMotionSettings } from '../utils/motion'
import { getLogicSentryAnalysis, getCorrectAnswerTutor } from '../api/client'
import * as GameEventBus from '../utils/GameEventBus'
import ConcretePackers from './ConcretePackers'
import PotionAlchemists from './PotionAlchemists'

const HERO_IMGS = {
  Arcanos: '/assets/heroes/arcanos.svg',
  Blaze: '/assets/heroes/blaze.svg',
  Shadow: '/assets/heroes/shadow.svg',
  Luna: '/assets/heroes/luna.svg',
  Titan: '/assets/heroes/titan.svg',
  Webweaver: '/assets/heroes/webweaver.svg',
  Volt: '/assets/heroes/volt.svg',
  Tempest: '/assets/heroes/tempest.svg',
  Zenith: '/assets/heroes/zenith.svg',
}

const HERO_ATTACKS = {
  Arcanos: { name: 'Arcane Blast', color: '#a855f7', particle: 'spell' },
  Blaze: { name: 'Fire Punch', color: '#ef4444', particle: 'fire' },
  Shadow: { name: 'Shadow Strike', color: '#6366f1', particle: 'slash' },
  Luna: { name: 'Moon Beam', color: '#06b6d4', particle: 'spell' },
  Titan: { name: 'Ground Smash', color: '#f59e0b', particle: 'impact' },
  Webweaver: { name: 'Web Whip', color: '#3b82f6', particle: 'slash' },
  Volt: { name: 'Lightning Bolt', color: '#facc15', particle: 'lightning' },
  Tempest: { name: 'Storm Gale', color: '#14b8a6', particle: 'spell' },
  Zenith: { name: 'Dark Kame Strike', color: '#f59e0b', particle: 'lightning' },
}

const BOSS_NAMES = ['Matrix-Web Spider', 'Geometric-Golem', 'Cipher-Serpent', 'Glitch-Worm', 'Error-Imp', 'Fractal-Phoenix']

// Boss accent colours — used to tint CombatScene HP bar and damage numbers.
const BOSS_COLORS = {
  'Matrix-Web Spider': '#ff00ff',
  'Geometric-Golem':   '#00ff88',
  'Cipher-Serpent':    '#00d4ff',
  'Glitch-Worm':       '#ff4444',
  'Error-Imp':         '#ff8800',
  'Fractal-Phoenix':   '#ff00aa',
}

// Phaser texture keys for boss images (loaded in CombatScene.preload).
// Null entries fall back to a coloured rectangle in the Phaser scene.
const BOSS_IMG_KEYS = {
  'Matrix-Web Spider': 'combat_boss_1',
  'Geometric-Golem':   'combat_boss_2',
  'Cipher-Serpent':    'combat_boss_3',
  'Glitch-Worm':       'combat_boss_4',
  'Error-Imp':         'combat_boss_5',
  'Fractal-Phoenix':   'combat_boss_6',
}

let coinIdCounter = 0
function GoldCoinIcon({ size = 24 }) {
  const [id] = useState(() => `cg_${++coinIdCounter}`)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={`url(#${id})`} stroke="#b8860b" strokeWidth="1.5"/>
      <text x="12" y="16" textAnchor="middle" fill="#8B6914" fontSize="12" fontWeight="bold" fontFamily="Orbitron, sans-serif">G</text>
      <defs>
        <radialGradient id={id} cx="40%" cy="35%">
          <stop offset="0%" stopColor="#ffe066"/>
          <stop offset="70%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#d4930a"/>
        </radialGradient>
      </defs>
    </svg>
  )
}

// ─── Answer-choice UI components (remain in DOM for accessibility) ────────────
// All combat visuals (health bars, fighter sprites, attack effects, damage
// numbers, screen flash) have been moved into CombatScene.js (Phaser canvas).
// The components below render only the interactive answer panels that require
// HTML/DOM for keyboard/screen-reader accessibility.

function BattleChoices({ choices, correctAnswer, onSelect, disabled, accent }) {
  const [selected, setSelected] = useState(null)
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {(choices || []).map((choice, idx) => {
        const isCorrect = String(choice).trim() === String(correctAnswer).trim()
        const wasSelected = selected === idx
        let bg = 'rgba(255,255,255,0.04)'
        let border = '1px solid rgba(255,255,255,0.1)'
        if (wasSelected) {
          bg = isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'
          border = isCorrect ? '1px solid #22c55e' : '1px solid #ef4444'
        }
        return (
          <button key={idx} disabled={disabled || selected !== null} onClick={() => {
            setSelected(idx)
            onSelect(isCorrect, String(choice))
            setTimeout(() => setSelected(null), 1200)
          }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700,
            color: wasSelected ? (isCorrect ? '#22c55e' : '#ef4444') : '#e0e0e0',
            background: bg, border, borderRadius: '8px', padding: '10px 16px',
            cursor: disabled || selected !== null ? 'default' : 'pointer',
            transition: 'all 0.2s', minWidth: '70px', opacity: disabled ? 0.5 : 1,
          }}>
            {choice}
          </button>
        )
      })}
    </div>
  )
}

function DragDropBattle({ game, onCorrect, onWrong }) {
  const items = game.drag_items || game.choices || []
  const correctOrder = game.drag_correct_order || []
  const [slots, setSlots] = useState([])
  const [available, setAvailable] = useState([...items])
  const [result, setResult] = useState(null)

  const addToSlot = (item, idx) => {
    const na = [...available]; na.splice(idx, 1); setAvailable(na)
    setSlots([...slots, item])
  }
  const removeFromSlot = (idx) => {
    const item = slots[idx]
    const ns = [...slots]; ns.splice(idx, 1); setSlots(ns)
    setAvailable([...available, item])
    setResult(null)
  }
  const check = () => {
    let correct = false
    const normalize = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (correctOrder.length > 0) {
      correct = slots.length === correctOrder.length &&
        slots.every((s, i) => normalize(s) === normalize(correctOrder[i]))
      if (!correct && game.correct_answer) {
        const joined = slots.join(' ').trim()
        correct = normalize(joined) === normalize(game.correct_answer) ||
          normalize(slots.join('')) === normalize(game.correct_answer)
      }
    } else {
      const answer = slots.join(' ')
      correct = normalize(answer) === normalize(game.correct_answer) ||
        normalize(slots.join('')) === normalize(game.correct_answer)
    }
    setResult(correct)
    if (correct) onCorrect()
    else { onWrong(slots.join(' ').trim()); setTimeout(() => setResult(null), 1500) }
  }

  return (
    <div>
      <div style={{
        fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
        color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '8px',
      }}>ARRANGE THE ATTACK SEQUENCE</div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', color: '#e0e0e0', marginBottom: '10px' }}>
        {game.question}
      </div>
      <div style={{
        minHeight: '42px', border: '2px dashed rgba(251,191,36,0.3)', borderRadius: '10px',
        padding: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: '8px',
        background: result === true ? 'rgba(34,197,94,0.08)' : result === false ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.01)',
        transition: 'background 0.3s',
      }}>
        {slots.length === 0 && <span style={{ color: '#555', fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', alignSelf: 'center' }}>Tap to build your combo</span>}
        {slots.map((item, idx) => (
          <button key={idx} onClick={() => removeFromSlot(idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 700, color: '#fff',
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
          }}>{item}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '8px' }}>
        {available.map((item, idx) => (
          <button key={idx} onClick={() => addToSlot(item, idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 700, color: '#fbbf24',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', transition: 'all 0.2s',
          }}>{item}</button>
        ))}
      </div>
      {slots.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={check} disabled={slots.length < items.length} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#fff',
            background: slots.length < items.length ? 'linear-gradient(135deg, #666, #555)' : 'linear-gradient(135deg, #fbbf24, #f59e0b)', border: 'none',
            borderRadius: '8px', padding: '8px 20px', cursor: slots.length < items.length ? 'not-allowed' : 'pointer', letterSpacing: '1px',
            opacity: slots.length < items.length ? 0.5 : 1,
          }}>EXECUTE COMBO</button>
        </div>
      )}
      {result === false && (
        <div style={{ textAlign: 'center', marginTop: '6px', fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '12px', fontWeight: 600 }}>
          {game.fail_message || 'Combo failed! Rearrange!'}
        </div>
      )}
    </div>
  )
}

function MiniGameView({ game, hero, heroColor, onComplete, sessionId, session }) {
  const motion = useMotionSettings()

  // ── Equipped-item combat bonuses (unchanged logic) ──────────────────────────
  const equippedEffects = useMemo(() => {
    const effects = { damage_boost: 0, defense: 0, gold_boost: 0, time_boost: 0, heal: 0, all_boost: 0 }
    const equipped = session?.equipped || []
    const ITEMS_MAP = {
      fire_sword:           { type: 'damage_boost', value: 15 },
      ice_dagger:           { type: 'damage_boost', value: 10 },
      magic_wand:           { type: 'damage_boost', value: 20 },
      lightning_gauntlets:  { type: 'damage_boost', value: 30 },
      void_blade:           { type: 'damage_boost', value: 40 },
      ice_shield:           { type: 'defense',      value: 15 },
      dragon_armor:         { type: 'defense',      value: 25 },
      shadow_cloak:         { type: 'defense',      value: 35 },
      titan_plate:          { type: 'defense',      value: 50 },
      fox_companion:        { type: 'gold_boost',   value: 5  },
      dragon_hatchling:     { type: 'damage_boost', value: 12 },
      phoenix_companion:    { type: 'all_boost',    value: 10 },
      star_sprite:          { type: 'time_boost',   value: 5  },
      rocket_board:         { type: 'time_boost',   value: 4  },
      dino_saddle:          { type: 'damage_boost', value: 18 },
      storm_pegasus:        { type: 'all_boost',    value: 15 },
    }
    equipped.forEach(id => {
      const e = ITEMS_MAP[id]
      if (e) effects[e.type] = (effects[e.type] || 0) + e.value
    })
    if (effects.all_boost > 0) {
      effects.damage_boost += effects.all_boost
      effects.defense += effects.all_boost
      effects.gold_boost += effects.all_boost
      effects.time_boost += effects.all_boost
    }
    return effects
  }, [session?.equipped])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const baseDamage      = 100
  const totalDamage     = baseDamage + equippedEffects.damage_boost
  const defenseReduction = equippedEffects.defense
  const goldBonus       = equippedEffects.gold_boost
  const timeBonus       = equippedEffects.time_boost
  const baseTimeLimit   = (game.time_limit || 10) + timeBonus
  const rewardCoins     = (game.reward_coins || 15) + goldBonus

  // ── Boss identity (deterministic from hero + question seed) ─────────────────
  const bossName = useMemo(() => {
    const seedSource = `${hero}:${game?.question || ''}:${game?.correct_answer || ''}`
    let hash = 0
    for (let i = 0; i < seedSource.length; i++) {
      hash = ((hash << 5) - hash + seedSource.charCodeAt(i)) | 0
    }
    return BOSS_NAMES[Math.abs(hash) % BOSS_NAMES.length]
  }, [hero, game?.question, game?.correct_answer])

  const bossColor = BOSS_COLORS[bossName] || '#ef4444'
  const bossImgKey = BOSS_IMG_KEYS[bossName] || null

  // ── HP state (authoritative; emitted to CombatScene via hp-update) ───────────
  const heroMaxHP   = 100
  const bossMaxHP   = 100
  const [heroHP, setHeroHP] = useState(heroMaxHP)
  const [bossHP, setBossHP] = useState(bossMaxHP)

  // ── UI phase gate ────────────────────────────────────────────────────────────
  // 'waiting'  – combat:start emitted; waiting for combat:ui-ready from CombatScene
  // 'battle'   – answer panel shown
  // 'done'     – combat ended; waiting for onComplete timeout
  const [uiPhase, setUiPhase] = useState('waiting')

  // ── Timed-game countdown (displayed in React; timer bar in Phaser) ───────────
  const [timerLeft,    setTimerLeft]    = useState(baseTimeLimit)
  const [timerExpired, setTimerExpired] = useState(false)
  const timerIntervalRef = useRef(null)

  // ── Answer feedback panels (Logic Sentry + Tutor) ────────────────────────────
  const [logicFeedback,   setLogicFeedback]   = useState(null)
  const [correctFeedback, setCorrectFeedback] = useState(null)

  const completed = uiPhase === 'done'

  // ── Emit combat:start when the mini-game mounts ──────────────────────────────
  useEffect(() => {
    const heroImg = HERO_IMGS[hero] || HERO_IMGS.Arcanos
    const attackInfo = HERO_ATTACKS[hero] || HERO_ATTACKS.Arcanos
    GameEventBus.emit('combat:start', {
      hero,
      heroColor,
      heroImg,
      bossName,
      bossColor,
      bossImg: bossImgKey,
      heroHP:    heroMaxHP,
      heroMaxHP,
      bossHP:    bossMaxHP,
      bossMaxHP,
      attackType:   attackInfo.particle,
      attackColor:  attackInfo.color,
      gameType:     game.type,
      timeLimit:    baseTimeLimit,
      reduceEffects: motion.reduceEffects,
    })

    // Listen for CombatScene to signal the arena is ready
    const unsubReady = GameEventBus.on('combat:ui-ready', () => {
      setUiPhase('battle')
    })
    return () => {
      unsubReady()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Start timed countdown once battle phase begins ───────────────────────────
  useEffect(() => {
    if (uiPhase !== 'battle' || game.type !== 'timed') return
    setTimerLeft(baseTimeLimit)
    timerIntervalRef.current = setInterval(() => {
      setTimerLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          setTimerExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerIntervalRef.current)
  }, [uiPhase, game.type, baseTimeLimit])

  // ── HP sync: emit hp-update after every HP change ───────────────────────────
  useEffect(() => {
    GameEventBus.emit('combat:hp-update', { heroHP, bossHP })
  }, [heroHP, bossHP])

  // ── heroAttack: emits player-attack; decrements bossHP ──────────────────────
  const heroAttack = useCallback(() => {
    if (completed) return
    const attackInfo  = HERO_ATTACKS[hero] || HERO_ATTACKS.Arcanos
    const isCrit      = Math.random() < 0.2
    const dmg         = isCrit ? Math.floor(totalDamage * 1.5) : totalDamage

    GameEventBus.emit('combat:player-attack', {
      damage:     dmg,
      isCrit,
      attackType: attackInfo.particle,
      color:      attackInfo.color,
    })

    setBossHP(prev => {
      const next = Math.max(0, prev - dmg)
      if (next <= 0) {
        setUiPhase('done')
        GameEventBus.emit('combat:end', { outcome: 'victory', rewardCoins })
        setTimeout(() => onComplete(rewardCoins), 3000)
      }
      return next
    })
  }, [completed, hero, totalDamage, rewardCoins, onComplete])

  // ── bossAttack: emits boss-attack; decrements heroHP ────────────────────────
  const bossAttack = useCallback(() => {
    const rawDmg = 15 + Math.floor(Math.random() * 10)
    const dmg    = Math.max(3, rawDmg - Math.floor(defenseReduction * 0.4))

    GameEventBus.emit('combat:boss-attack', { damage: dmg })

    setHeroHP(prev => Math.max(10, prev - dmg))
  }, [defenseReduction])

  // ── Answer handlers ──────────────────────────────────────────────────────────
  const handleCorrectAnswer = useCallback(() => {
    if (completed) return
    setLogicFeedback(null)
    if (sessionId && game?.question && game?.correct_answer) {
      setCorrectFeedback({ loading: true })
      getCorrectAnswerTutor(sessionId, hero, game.question, String(game.correct_answer))
        .then(res => {
          if (res?.explanation) setCorrectFeedback(res)
          else setCorrectFeedback(null)
        })
        .catch(() => setCorrectFeedback(null))
    }
    heroAttack()
  }, [heroAttack, completed, sessionId, hero, game])

  const handleWrongAnswer = useCallback((studentInput = '') => {
    setCorrectFeedback(null)
    bossAttack()
    if (sessionId && game?.question && game?.correct_answer && studentInput) {
      setLogicFeedback({ loading: true })
      getLogicSentryAnalysis(sessionId, hero, game.question, String(game.correct_answer), String(studentInput))
        .then(res => {
          if (res?.in_universe_feedback) setLogicFeedback(res)
          else setLogicFeedback(null)
        })
        .catch(() => setLogicFeedback(null))
    }
  }, [bossAttack, sessionId, hero, game])

  // ── Timed-game retry ─────────────────────────────────────────────────────────
  const retryTimed = () => {
    setTimerExpired(false)
    setTimerLeft(baseTimeLimit)
    // Re-signal CombatScene to restart timer bar
    GameEventBus.emit('combat:start', {
      hero,
      heroColor,
      heroImg:   HERO_IMGS[hero] || HERO_IMGS.Arcanos,
      bossName,
      bossColor,
      bossImg:   bossImgKey,
      heroHP,
      heroMaxHP,
      bossHP,
      bossMaxHP,
      attackType:   (HERO_ATTACKS[hero] || HERO_ATTACKS.Arcanos).particle,
      attackColor:  (HERO_ATTACKS[hero] || HERO_ATTACKS.Arcanos).color,
      gameType:     game.type,
      timeLimit:    baseTimeLimit,
      reduceEffects: motion.reduceEffects,
    })
    timerIntervalRef.current = setInterval(() => {
      setTimerLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          setTimerExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  // While waiting for combat:ui-ready, show a loading placeholder so the user
  // knows combat is starting but the answer buttons aren't revealed yet.
  if (uiPhase === 'waiting') {
    return (
      <div id="combat-answer-panel" style={{ margin: '16px 0', padding: '16px', textAlign: 'center' }}>
        {(equippedEffects.damage_boost > 0 || equippedEffects.defense > 0 || equippedEffects.gold_boost > 0 || equippedEffects.time_boost > 0) && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            {equippedEffects.damage_boost > 0 && <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', padding: '2px 6px' }}>ATK +{equippedEffects.damage_boost}</span>}
            {equippedEffects.defense > 0      && <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '4px', padding: '2px 6px' }}>DEF +{equippedEffects.defense}</span>}
            {equippedEffects.gold_boost > 0   && <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '4px', padding: '2px 6px' }}>GOLD +{equippedEffects.gold_boost}</span>}
            {equippedEffects.time_boost > 0   && <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#06b6d4', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '4px', padding: '2px 6px' }}>TIME +{equippedEffects.time_boost}s</span>}
          </div>
        )}
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', color: '#9ca3af' }}>
          Preparing battle...
        </div>
      </div>
    )
  }

  if (uiPhase === 'done') {
    return (
      <div id="combat-answer-panel" style={{ margin: '16px 0', padding: '16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'Orbitron', sans-serif", fontSize: '20px', fontWeight: 800, color: '#fbbf24' }}>
          <GoldCoinIcon size={28} />
          +{rewardCoins} Gold!
        </div>
      </div>
    )
  }

  // uiPhase === 'battle'
  return (
    <div id="combat-answer-panel" style={{ margin: '16px 0' }}>
      <div style={{ padding: '12px 12px 0' }}>
        {game.type === 'timed' && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden', marginBottom: '4px',
            }}>
              <div style={{
                height: '100%', borderRadius: '3px', transformOrigin: 'left',
                background: timerLeft > 3 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                width: `${(timerLeft / baseTimeLimit) * 100}%`,
                transition: 'width 1s linear, background 0.3s',
              }} />
            </div>
            <div style={{
              textAlign: 'center', fontFamily: "'Orbitron', sans-serif", fontSize: '13px',
              fontWeight: 800, color: timerLeft > 3 ? '#3b82f6' : '#ef4444',
            }}>
              {timerLeft}s
            </div>
          </div>
        )}

        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
          color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '6px',
          textTransform: 'uppercase',
        }}>
          {game.type === 'quicktime' ? 'CHOOSE YOUR ATTACK' :
           game.type === 'timed'     ? 'QUICK STRIKE' :
           game.type === 'dragdrop'  ? 'BUILD YOUR COMBO' :
           'CHOOSE YOUR PATH'}
        </div>

        <div style={{
          textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '15px',
          color: '#e0e0e0', fontWeight: 600, marginBottom: '10px',
          padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {game.question}
        </div>

        {(game.type === 'quicktime' || game.type === 'timed') && (
          <>
            <BattleChoices
              choices={game.choices}
              correctAnswer={game.correct_answer}
              onSelect={(correct) => correct ? handleCorrectAnswer() : handleWrongAnswer()}
              disabled={completed || (game.type === 'timed' && timerExpired)}
              accent={heroColor}
            />
            {game.type === 'timed' && timerExpired && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Time&#39;s up!
                </div>
                <button onClick={retryTimed} style={{
                  fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#fff',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none',
                  borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', letterSpacing: '1px',
                }}>RETRY</button>
              </div>
            )}
          </>
        )}

        {game.type === 'choice' && (
          <BattleChoices
            choices={game.choices}
            correctAnswer={game.correct_answer}
            onSelect={(correct) => correct ? handleCorrectAnswer() : handleWrongAnswer()}
            disabled={completed}
            accent="#a855f7"
          />
        )}

        {game.type === 'dragdrop' && (
          <DragDropBattle game={game} onCorrect={handleCorrectAnswer} onWrong={handleWrongAnswer} />
        )}
      </div>

      {/* ── Logic Sentry Feedback ── */}
      {logicFeedback && (
        <div style={{
          margin: '12px 12px 0', padding: '12px 14px',
          background: logicFeedback.loading
            ? 'rgba(251,191,36,0.04)'
            : 'linear-gradient(135deg, rgba(239,68,68,0.07), rgba(251,191,36,0.07))',
          border: '1px solid rgba(251,191,36,0.25)', borderRadius: '12px', backdropFilter: 'blur(6px)',
        }}>
          {logicFeedback.loading ? (
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: '#fbbf24', fontWeight: 600, textAlign: 'center' }}>
              🔍 Logic Sentry analyzing...
            </div>
          ) : (
            <>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '2px', color: '#fbbf24', marginBottom: '8px' }}>
                ⚠️ LOGIC SENTRY ALERT
              </div>
              <p style={{ margin: 0, fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 600, lineHeight: '1.5', color: '#fde68a' }}>
                {logicFeedback.in_universe_feedback}
              </p>
              {logicFeedback.perseverance_penalty > 0 && (
                <div style={{ marginTop: '6px', fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: '#f87171', fontWeight: 700 }}>
                  −{logicFeedback.perseverance_penalty} Perseverance
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Correct Answer Tutor ── */}
      {correctFeedback && (
        <div style={{
          margin: '12px 12px 0', padding: '12px 14px',
          background: correctFeedback.loading
            ? 'rgba(34,197,94,0.04)'
            : 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(0,212,255,0.08))',
          border: '1px solid rgba(34,197,94,0.3)', borderRadius: '12px', backdropFilter: 'blur(6px)',
        }}>
          {correctFeedback.loading ? (
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: '#22c55e', fontWeight: 600, textAlign: 'center' }}>
              ✨ Tutor explaining...
            </div>
          ) : (
            <>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, letterSpacing: '2px', color: '#22c55e', marginBottom: '8px' }}>
                ✅ LOGIC GATE CRACKED
              </div>
              <p style={{ margin: 0, fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 600, lineHeight: '1.5', color: '#bbf7d0' }}>
                {correctFeedback.explanation}
              </p>
            </>
          )}
        </div>
      )}

      <div style={{
        textAlign: 'center', marginTop: '8px', marginBottom: '4px',
        fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: '#4b5563',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
      }}>
        <GoldCoinIcon size={14} />
        Victory Reward: {rewardCoins} Gold{goldBonus > 0 ? ` (+${goldBonus} bonus)` : ''}
      </div>
    </div>
  )
}

/**
 * MiniGame — dispatcher that routes to either a specialized interactive game
 * (ConcretePackers, PotionAlchemists) or the standard battle-arena MiniGameView.
 * Keeping the specialized types here avoids any React Rules-of-Hooks issues
 * because the battle-arena component always calls its hooks unconditionally.
 */
export default function MiniGame({ game, onComplete, sessionId, ...rest }) {
  if (game.type === 'concrete_packers') {
    return (
      <div style={{ margin: '12px 0' }}>
        <ConcretePackers
          equation={game.equation || '5 + 5'}
          sessionId={sessionId}
          onComplete={() => onComplete(game.reward_coins || 20)}
        />
      </div>
    )
  }
  if (game.type === 'potion_alchemists') {
    return (
      <div style={{ margin: '12px 0' }}>
        <PotionAlchemists
          sessionId={sessionId}
          onComplete={() => onComplete(game.reward_coins || 25)}
        />
      </div>
    )
  }
  return <MiniGameView game={game} onComplete={onComplete} sessionId={sessionId} {...rest} />
}

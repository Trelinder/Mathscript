import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { fetchShop, buyItem, equipItem, unequipItem } from '../api/client'

const RARITY_COLORS = {
  common: { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.2)', label: 'Common' },
  rare: { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', label: 'Rare' },
  epic: { color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', label: 'Epic' },
  legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', label: 'Legendary' },
}

const CATEGORY_INFO = {
  weapons: { label: 'Weapons', color: '#ef4444' },
  armor: { label: 'Armor', color: '#3b82f6' },
  pets: { label: 'Pets', color: '#22c55e' },
  potions: { label: 'Potions', color: '#a855f7' },
  mounts: { label: 'Mounts', color: '#f59e0b' },
}

const EFFECT_LABELS = {
  damage_boost: 'ATK',
  defense: 'DEF',
  gold_boost: 'GOLD',
  time_boost: 'TIME',
  heal: 'HEAL',
  all_boost: 'ALL',
}

function ItemIcon({ itemId, size = 36 }) {
  const s = size
  const icons = {
    fire_sword: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M20 4L24 14L20 12L16 14L20 4Z" fill="#fbbf24"/>
        <rect x="18" y="12" width="4" height="18" rx="1" fill="#d1d5db"/>
        <rect x="18" y="12" width="4" height="18" rx="1" fill="url(#fs_g)" opacity="0.5"/>
        <rect x="13" y="28" width="14" height="4" rx="2" fill="#78716c"/>
        <rect x="17" y="32" width="6" height="4" rx="1" fill="#57534e"/>
        <path d="M22 8C24 10 26 14 24 18" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
        <path d="M18 10C16 12 15 15 16 18" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        <defs><linearGradient id="fs_g" x1="18" y1="12" x2="22" y2="30"><stop stopColor="#e5e7eb"/><stop offset="1" stopColor="#9ca3af"/></linearGradient></defs>
      </svg>
    ),
    ice_dagger: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M20 4L23 20H17L20 4Z" fill="#93c5fd"/>
        <path d="M20 4L22 14H18L20 4Z" fill="#dbeafe"/>
        <rect x="17" y="20" width="6" height="3" rx="1" fill="#64748b"/>
        <rect x="18" y="23" width="4" height="10" rx="1" fill="#475569"/>
        <circle cx="20" cy="12" r="1.5" fill="#fff" opacity="0.7"/>
        <path d="M16 8L18 10" stroke="#bfdbfe" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
        <path d="M24 8L22 10" stroke="#bfdbfe" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
    magic_wand: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="18" y="10" width="4" height="22" rx="2" fill="#7c3aed" transform="rotate(-15 20 20)"/>
        <circle cx="20" cy="8" r="5" fill="#a855f7" stroke="#c084fc" strokeWidth="1.5"/>
        <circle cx="20" cy="8" r="2.5" fill="#e9d5ff"/>
        <path d="M14 5L16 7" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
        <path d="M26 5L24 7" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
        <path d="M20 2V4" stroke="#c084fc" strokeWidth="1" strokeLinecap="round"/>
        <circle cx="15" cy="3" r="0.8" fill="#c084fc"/>
        <circle cx="25" cy="4" r="0.6" fill="#e9d5ff"/>
      </svg>
    ),
    lightning_gauntlets: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M12 16C12 12 15 8 20 8C25 8 28 12 28 16V28C28 30 26 32 24 32H16C14 32 12 30 12 28V16Z" fill="#475569"/>
        <path d="M14 16C14 13 16 10 20 10C24 10 26 13 26 16V26C26 28 25 30 24 30H16C15 30 14 28 14 26V16Z" fill="#64748b"/>
        <path d="M19 14L17 20H20L18 26" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M23 14L21 18H24L22 22" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      </svg>
    ),
    void_blade: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M20 2L25 18H15L20 2Z" fill="#1e1b4b"/>
        <path d="M20 2L23 14H17L20 2Z" fill="#312e81"/>
        <path d="M20 5L22 12H18L20 5Z" fill="#4338ca" opacity="0.5"/>
        <rect x="15" y="18" width="10" height="3" rx="1" fill="#581c87"/>
        <rect x="17" y="21" width="6" height="12" rx="1" fill="#3b0764"/>
        <rect x="18" y="21" width="4" height="12" rx="1" fill="#581c87" opacity="0.5"/>
        <circle cx="20" cy="10" r="1.5" fill="#a78bfa" opacity="0.8"/>
        <circle cx="20" cy="10" r="3" fill="none" stroke="#a78bfa" strokeWidth="0.5" opacity="0.4"/>
      </svg>
    ),
    ice_shield: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M20 4L32 12V24C32 30 26 36 20 38C14 36 8 30 8 24V12L20 4Z" fill="#1e3a5f"/>
        <path d="M20 6L30 13V24C30 29 25 34 20 36C15 34 10 29 10 24V13L20 6Z" fill="#2563eb"/>
        <path d="M20 10L26 14V22C26 26 23 30 20 31C17 30 14 26 14 22V14L20 10Z" fill="#60a5fa" opacity="0.5"/>
        <path d="M20 14V28" stroke="#bfdbfe" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        <path d="M14 20H26" stroke="#bfdbfe" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        <circle cx="20" cy="20" r="3" fill="#dbeafe" opacity="0.4"/>
      </svg>
    ),
    dragon_armor: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M12 14C12 10 16 6 20 6C24 6 28 10 28 14V30C28 32 26 34 24 34H16C14 34 12 32 12 30V14Z" fill="#991b1b"/>
        <path d="M14 14C14 11 17 8 20 8C23 8 26 11 26 14V28C26 30 25 32 24 32H16C15 32 14 30 14 28V14Z" fill="#dc2626"/>
        <path d="M17 12L20 10L23 12L20 16Z" fill="#fbbf24" opacity="0.8"/>
        <path d="M15 18H25" stroke="#fca5a5" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
        <path d="M15 22H25" stroke="#fca5a5" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
        <path d="M15 26H25" stroke="#fca5a5" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
    shadow_cloak: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M10 10C10 8 14 6 20 6C26 6 30 8 30 10V32C30 34 28 36 26 38L20 34L14 38C12 36 10 34 10 32V10Z" fill="#1e1b4b"/>
        <path d="M12 10C12 9 15 7 20 7C25 7 28 9 28 10V30C28 32 26 34 24 36L20 33L16 36C14 34 12 32 12 30V10Z" fill="#312e81"/>
        <circle cx="20" cy="14" r="3" fill="#6366f1" opacity="0.5"/>
        <circle cx="20" cy="14" r="1.5" fill="#a5b4fc" opacity="0.7"/>
        <path d="M14 22Q17 24 20 22Q23 24 26 22" stroke="#4338ca" strokeWidth="1" fill="none" opacity="0.4"/>
      </svg>
    ),
    titan_plate: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M10 12C10 8 14 4 20 4C26 4 30 8 30 12V30C30 34 26 36 20 36C14 36 10 34 10 30V12Z" fill="#78716c"/>
        <path d="M12 12C12 9 15 6 20 6C25 6 28 9 28 12V28C28 32 25 34 20 34C15 34 12 32 12 28V12Z" fill="#a8a29e"/>
        <path d="M16 10L20 8L24 10L20 14Z" fill="#fbbf24"/>
        <rect x="16" y="16" width="8" height="10" rx="1" fill="#d6d3d1" opacity="0.5"/>
        <path d="M18 18V24" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
        <path d="M22 18V24" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
        <circle cx="20" cy="12" r="1" fill="#fbbf24" opacity="0.8"/>
      </svg>
    ),
    fox_companion: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M10 14L16 6V16Z" fill="#f97316"/>
        <path d="M30 14L24 6V16Z" fill="#f97316"/>
        <ellipse cx="20" cy="22" rx="10" ry="10" fill="#fb923c"/>
        <ellipse cx="20" cy="24" rx="6" ry="5" fill="#fed7aa"/>
        <circle cx="16" cy="19" r="2" fill="#1e293b"/>
        <circle cx="24" cy="19" r="2" fill="#1e293b"/>
        <circle cx="16.5" cy="18.5" r="0.7" fill="#fff"/>
        <circle cx="24.5" cy="18.5" r="0.7" fill="#fff"/>
        <ellipse cx="20" cy="23" rx="1.5" ry="1" fill="#1e293b"/>
        <path d="M18 25Q20 27 22 25" stroke="#1e293b" strokeWidth="0.8" fill="none"/>
      </svg>
    ),
    dragon_hatchling: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <ellipse cx="20" cy="24" rx="10" ry="10" fill="#16a34a"/>
        <ellipse cx="20" cy="26" rx="7" ry="6" fill="#22c55e"/>
        <path d="M12 14L16 18L14 20Z" fill="#16a34a"/>
        <path d="M28 14L24 18L26 20Z" fill="#16a34a"/>
        <circle cx="16" cy="20" r="2.5" fill="#fbbf24"/>
        <circle cx="24" cy="20" r="2.5" fill="#fbbf24"/>
        <circle cx="16" cy="20" r="1.2" fill="#1e293b"/>
        <circle cx="24" cy="20" r="1.2" fill="#1e293b"/>
        <path d="M18 27Q20 29 22 27" stroke="#15803d" strokeWidth="1.2" fill="none"/>
        <path d="M10 28L8 32" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M30 28L32 32" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    phoenix_companion: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M20 6L24 12L28 10L26 16L30 18L24 20L20 28L16 20L10 18L14 16L12 10L16 12L20 6Z" fill="#f97316"/>
        <path d="M20 10L23 14L26 13L24 17L20 24L16 17L14 13L17 14L20 10Z" fill="#fbbf24"/>
        <path d="M20 14L22 18L20 22L18 18L20 14Z" fill="#fef3c7"/>
        <circle cx="18" cy="16" r="1" fill="#7c2d12"/>
        <circle cx="22" cy="16" r="1" fill="#7c2d12"/>
        <path d="M16 28L14 34" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        <path d="M24 28L26 34" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      </svg>
    ),
    star_sprite: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="8" fill="#818cf8" opacity="0.3"/>
        <circle cx="20" cy="20" r="5" fill="#a5b4fc"/>
        <circle cx="20" cy="20" r="3" fill="#e0e7ff"/>
        <path d="M20 8V12" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 28V32" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 20H12" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M28 20H32" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 12L14.5 14.5" stroke="#c7d2fe" strokeWidth="1" strokeLinecap="round"/>
        <path d="M25.5 25.5L28 28" stroke="#c7d2fe" strokeWidth="1" strokeLinecap="round"/>
        <path d="M12 28L14.5 25.5" stroke="#c7d2fe" strokeWidth="1" strokeLinecap="round"/>
        <path d="M25.5 14.5L28 12" stroke="#c7d2fe" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
    healing_potion: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="16" y="6" width="8" height="4" rx="1" fill="#a8a29e"/>
        <path d="M14 12C14 10 16 10 16 10H24C24 10 26 10 26 12V30C26 34 22 36 20 36C18 36 14 34 14 30V12Z" fill="#dc2626"/>
        <path d="M16 12C16 11 17 10 17 10H23C23 10 24 11 24 12V28C24 32 22 34 20 34C18 34 16 32 16 28V12Z" fill="#ef4444" opacity="0.7"/>
        <path d="M18 18H22" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"/>
        <path d="M20 16V20" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"/>
        <path d="M17 14Q20 12 23 14" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.4"/>
      </svg>
    ),
    power_elixir: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="16" y="6" width="8" height="4" rx="1" fill="#a8a29e"/>
        <path d="M14 12C14 10 16 10 16 10H24C24 10 26 10 26 12V30C26 34 22 36 20 36C18 36 14 34 14 30V12Z" fill="#7c3aed"/>
        <path d="M16 12C16 11 17 10 17 10H23C23 10 24 11 24 12V28C24 32 22 34 20 34C18 34 16 32 16 28V12Z" fill="#8b5cf6" opacity="0.7"/>
        <path d="M18 20L20 16L22 20L20 24Z" fill="#c4b5fd" opacity="0.8"/>
        <circle cx="17" cy="26" r="1" fill="#ddd6fe" opacity="0.6"/>
        <circle cx="23" cy="22" r="0.8" fill="#ddd6fe" opacity="0.5"/>
        <path d="M17 14Q20 12 23 14" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.4"/>
      </svg>
    ),
    time_potion: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="16" y="6" width="8" height="4" rx="1" fill="#a8a29e"/>
        <path d="M14 12C14 10 16 10 16 10H24C24 10 26 10 26 12V30C26 34 22 36 20 36C18 36 14 34 14 30V12Z" fill="#0369a1"/>
        <path d="M16 12C16 11 17 10 17 10H23C23 10 24 11 24 12V28C24 32 22 34 20 34C18 34 16 32 16 28V12Z" fill="#0ea5e9" opacity="0.7"/>
        <circle cx="20" cy="22" r="5" stroke="#bae6fd" strokeWidth="1.5" fill="none"/>
        <path d="M20 19V22L22 23" stroke="#bae6fd" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M17 14Q20 12 23 14" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.4"/>
      </svg>
    ),
    lucky_charm: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="12" fill="#166534" opacity="0.3"/>
        <path d="M20 8C20 8 16 14 16 18C16 20 18 22 20 22C22 22 24 20 24 18C24 14 20 8 20 8Z" fill="#22c55e"/>
        <path d="M20 16C16 16 10 20 10 20C10 20 16 24 20 24C24 24 30 20 30 20C30 20 24 16 20 16Z" fill="#22c55e"/>
        <path d="M20 22C20 22 16 26 16 28C16 30 18 32 20 32C22 32 24 30 24 28C24 26 20 22 20 22Z" fill="#22c55e"/>
        <circle cx="20" cy="20" r="2" fill="#86efac"/>
      </svg>
    ),
    rocket_board: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <ellipse cx="20" cy="22" rx="14" ry="4" fill="#475569"/>
        <ellipse cx="20" cy="21" rx="14" ry="4" fill="#64748b"/>
        <ellipse cx="20" cy="20" rx="12" ry="3" fill="#94a3b8"/>
        <circle cx="10" cy="28" r="2" fill="#f97316" opacity="0.7"/>
        <circle cx="10" cy="28" r="1" fill="#fbbf24"/>
        <circle cx="30" cy="28" r="2" fill="#f97316" opacity="0.7"/>
        <circle cx="30" cy="28" r="1" fill="#fbbf24"/>
        <path d="M8 26L7 30" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
        <path d="M32 26L33 30" stroke="#f97316" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
        <path d="M14 18L20 14L26 18" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
    dino_saddle: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M8 26C8 20 12 14 20 14C28 14 32 20 32 26" stroke="#92400e" strokeWidth="4" strokeLinecap="round" fill="none"/>
        <path d="M10 24C10 20 14 16 20 16C26 16 30 20 30 24" stroke="#b45309" strokeWidth="3" strokeLinecap="round" fill="none"/>
        <ellipse cx="20" cy="18" rx="6" ry="4" fill="#a16207"/>
        <ellipse cx="20" cy="17" rx="5" ry="3" fill="#ca8a04"/>
        <rect x="18" y="10" width="4" height="8" rx="2" fill="#854d0e"/>
        <circle cx="12" cy="28" r="2" fill="#78716c"/>
        <circle cx="28" cy="28" r="2" fill="#78716c"/>
      </svg>
    ),
    storm_pegasus: (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path d="M14 28C14 24 16 18 20 16C24 18 26 24 26 28" fill="#e0e7ff"/>
        <path d="M20 16L18 10L14 12" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M20 16L22 10L26 12" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M8 18L14 22L10 16L16 20" stroke="#c7d2fe" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M32 18L26 22L30 16L24 20" stroke="#c7d2fe" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <circle cx="18" cy="14" r="1" fill="#6366f1"/>
        <circle cx="22" cy="14" r="1" fill="#6366f1"/>
        <path d="M14 28L12 34" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M26 28L28 34" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 8L19 6L20 4L21 6L20 8Z" fill="#fbbf24"/>
      </svg>
    ),
  }
  return icons[itemId] || (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="8" y="8" width="24" height="24" rx="6" fill="#475569" stroke="#64748b" strokeWidth="1.5"/>
      <text x="20" y="24" textAnchor="middle" fill="#9ca3af" fontSize="14" fontFamily="Orbitron">?</text>
    </svg>
  )
}

function EffectBadge({ effect }) {
  if (!effect) return null
  const label = EFFECT_LABELS[effect.type] || effect.type
  const colors = {
    damage_boost: '#ef4444',
    defense: '#3b82f6',
    gold_boost: '#fbbf24',
    time_boost: '#06b6d4',
    heal: '#22c55e',
    all_boost: '#a855f7',
  }
  const c = colors[effect.type] || '#9ca3af'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
      color: c, background: `${c}15`, border: `1px solid ${c}33`,
      borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.5px',
    }}>
      {label} +{effect.value}
    </div>
  )
}

let shopCoinId = 0
function ShopCoin({ size = 18 }) {
  const [id] = useState(() => `sc_${++shopCoinId}`)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={`url(#${id})`} stroke="#b8860b" strokeWidth="1.5"/>
      <text x="12" y="16" textAnchor="middle" fill="#8B6914" fontSize="11" fontWeight="bold" fontFamily="Orbitron">G</text>
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

export default function ShopPanel({ sessionId, session, refreshSession, onClose }) {
  const [items, setItems] = useState([])
  const [buying, setBuying] = useState(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('weapons')
  const panelRef = useRef(null)

  useEffect(() => {
    fetchShop().then(setItems).catch(() => {})
    if (panelRef.current) {
      gsap.from(panelRef.current, { y: 50, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' })
    }
  }, [])

  const handleBuy = async (item) => {
    setBuying(item.id)
    setError('')
    try {
      await buyItem(item.id, sessionId)
      await refreshSession()
    } catch (e) {
      setError(e.message)
    }
    setBuying(null)
  }

  const handleEquip = async (itemId) => {
    try {
      await equipItem(itemId, sessionId)
      await refreshSession()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleUnequip = async (itemId) => {
    try {
      await unequipItem(itemId, sessionId)
      await refreshSession()
    } catch (e) {
      setError(e.message)
    }
  }

  const categories = ['weapons', 'armor', 'pets', 'potions', 'mounts']
  const filtered = items.filter(i => i.category === category)
  const equipped = session.equipped || []
  const potions = session.potions || []

  return (
    <div ref={panelRef} style={{
      background: 'rgba(10,14,26,0.97)',
      border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 4px 30px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 800,
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '2px',
        }}>
          HERO SHOP
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#fbbf24',
          background: 'rgba(251,191,36,0.08)', padding: '6px 14px', borderRadius: '8px',
          border: '1px solid rgba(251,191,36,0.15)',
        }}>
          <ShopCoin size={18} /> {session.coins}
        </div>
      </div>

      {equipped.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px',
          padding: '10px 12px', background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', color: '#6b7280', letterSpacing: '1px', alignSelf: 'center', marginRight: '4px' }}>EQUIPPED</span>
          {equipped.map(eid => {
            const item = items.find(i => i.id === eid)
            if (!item) return null
            const r = RARITY_COLORS[item.rarity] || RARITY_COLORS.common
            return (
              <div key={eid} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: r.bg, border: `1px solid ${r.border}`, borderRadius: '6px',
                padding: '3px 8px',
              }}>
                <ItemIcon itemId={eid} size={18} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: r.color, fontWeight: 700 }}>{item.name}</span>
              </div>
            )
          })}
        </div>
      )}

      {potions.length > 0 && (
        <div style={{
          display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px',
          padding: '10px 12px', background: 'rgba(168,85,247,0.03)',
          borderRadius: '10px', border: '1px solid rgba(168,85,247,0.1)',
        }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', color: '#6b7280', letterSpacing: '1px', alignSelf: 'center', marginRight: '4px' }}>POTIONS</span>
          {[...new Set(potions)].map(pid => {
            const count = potions.filter(p => p === pid).length
            const item = items.find(i => i.id === pid)
            if (!item) return null
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: '6px', padding: '3px 8px',
              }}>
                <ItemIcon itemId={pid} size={18} />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>x{count}</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap',
      }}>
        {categories.map(cat => {
          const info = CATEGORY_INFO[cat]
          const active = category === cat
          return (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
              color: active ? '#fff' : info.color,
              background: active ? `${info.color}33` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? `${info.color}66` : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
              transition: 'all 0.2s', letterSpacing: '1px',
            }}>
              {info.label.toUpperCase()}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{
          color: '#fca5a5', fontFamily: "'Rajdhani', sans-serif", fontSize: '13px',
          fontWeight: 600, marginBottom: '12px', padding: '8px 12px',
          background: 'rgba(239,68,68,0.08)', borderRadius: '8px',
          border: '1px solid rgba(239,68,68,0.15)',
        }}>{error}</div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px',
      }}>
        {filtered.map(item => {
          const isConsumable = item.consumable
          const owned = !isConsumable && session.inventory?.includes(item.id)
          const isEquipped = equipped.includes(item.id)
          const potionCount = isConsumable ? potions.filter(p => p === item.id).length : 0
          const canAfford = session.coins >= item.price
          const r = RARITY_COLORS[item.rarity] || RARITY_COLORS.common

          return (
            <div key={item.id} style={{
              background: isEquipped ? `${r.color}12` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isEquipped ? `${r.color}44` : r.border}`,
              borderRadius: '14px',
              padding: '16px 14px',
              textAlign: 'center',
              transition: 'all 0.3s',
              position: 'relative',
            }}>
              {isEquipped && (
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  fontFamily: "'Orbitron', sans-serif", fontSize: '7px', fontWeight: 700,
                  color: '#22c55e', background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '4px', padding: '2px 5px', letterSpacing: '0.5px',
                }}>EQUIPPED</div>
              )}

              <div style={{ marginBottom: '8px' }}>
                <ItemIcon itemId={item.id} size={40} />
              </div>

              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 700,
                color: r.color, marginBottom: '2px',
              }}>{item.name}</div>

              <div style={{
                fontFamily: "'Orbitron', sans-serif", fontSize: '8px', fontWeight: 600,
                color: r.color, opacity: 0.6, marginBottom: '6px', letterSpacing: '1px',
              }}>{r.label}</div>

              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: '11px',
                color: '#9ca3af', marginBottom: '8px', lineHeight: '1.3',
                minHeight: '28px',
              }}>{item.description}</div>

              <div style={{ marginBottom: '10px' }}>
                <EffectBadge effect={item.effect} />
              </div>

              {owned ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {isEquipped ? (
                    <button onClick={() => handleUnequip(item.id)} style={{
                      fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
                      color: '#9ca3af', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                      padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.5px',
                    }}>UNEQUIP</button>
                  ) : (
                    <button onClick={() => handleEquip(item.id)} style={{
                      fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
                      color: '#22c55e', background: 'rgba(34,197,94,0.1)',
                      border: '1px solid rgba(34,197,94,0.25)', borderRadius: '6px',
                      padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.5px',
                    }}>EQUIP</button>
                  )}
                </div>
              ) : isConsumable && potionCount > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 700,
                    color: '#a855f7',
                  }}>Owned: x{potionCount}</div>
                  <button onClick={() => handleBuy(item)} disabled={!canAfford || buying === item.id} style={{
                    fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
                    color: canAfford ? '#fbbf24' : '#555',
                    background: canAfford ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${canAfford ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '6px', padding: '6px 12px', cursor: canAfford ? 'pointer' : 'not-allowed',
                    letterSpacing: '0.5px',
                  }}>
                    {buying === item.id ? '...' : `BUY +1`}
                    <span style={{ marginLeft: '4px', fontSize: '9px' }}>{item.price}</span>
                  </button>
                </div>
              ) : (
                <button onClick={() => handleBuy(item)} disabled={!canAfford || buying === item.id} style={{
                  fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  color: canAfford ? '#0a0e1a' : '#555', width: '100%',
                  background: canAfford ? 'linear-gradient(135deg, #fbbf24, #d97706)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${canAfford ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '8px', padding: '8px 14px',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s', letterSpacing: '0.5px',
                }}>
                  {buying === item.id ? '...' : (<><ShopCoin size={14} /> {item.price}</>)}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={onClose} style={{
        fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 600,
        color: '#9ca3af', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
        padding: '8px 18px', cursor: 'pointer', marginTop: '16px', transition: 'all 0.2s',
      }}>Close Shop</button>
    </div>
  )
}

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HeroCard from './HeroCard'

vi.mock('gsap', () => ({
  gsap: {
    from: vi.fn(),
    set: vi.fn(),
    to: vi.fn(),
  },
}))

describe('HeroCard', () => {
  it('shows premium lock badge when hero is locked', () => {
    render(
      <HeroCard
        name="Luna"
        selected={false}
        locked
        lockLabel="Premium"
        onClick={() => {}}
        index={0}
      />
    )

    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByAltText('Luna')).toBeInTheDocument()
  })

  it('fires click handler when selected', () => {
    const onClick = vi.fn()
    render(
      <HeroCard
        name="Zenith"
        selected
        locked={false}
        onClick={onClick}
        index={1}
      />
    )

    fireEvent.click(screen.getByText('Zenith'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

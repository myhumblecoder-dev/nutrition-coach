import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TodayDashboard from './TodayDashboard'

vi.mock('@/components/DeleteMealButton', () => ({
  default: vi.fn(() => <button aria-label="Delete meal" />),
}))

describe('TodayDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only extracted meals get the via chat chip', async () => {
    const props = {
      consumed: { calories: 800, protein: 60, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: { calories: 2000, protein: 150 },
      meals: [
        {
          id: '1',
          foodItems: JSON.stringify([
            { name: 'Oatmeal', portion: '1 bowl', calories: 300, protein: 10 },
          ]),
          totalCalories: 350,
          totalProtein: 12,
          source: 'extracted',
        },
        {
          id: '2',
          foodItems: JSON.stringify([
            { name: 'Chicken Salad', portion: '1 plate', calories: 450, protein: 48 },
          ]),
          totalCalories: 450,
          totalProtein: 48,
          source: 'manual',
        },
      ],
    }

    render(<TodayDashboard {...props} />)

    // Assert exactly one 'via chat' text is present
    expect(screen.getByText('via chat')).toBeInTheDocument()
    // Ensure the manual one doesn't have it
    const manualMeal = screen.getByText('Chicken Salad').closest('div')
    expect(manualMeal?.textContent).not.toContain('via chat')
  })

  it('TodayDashboard renders', async () => {
    const props = {
      consumed: { calories: 800, protein: 60, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: { calories: 2000, protein: 150 },
      meals: [
        {
          id: '1',
          // foodItems is stored as a JSON-encoded array (MealEntry schema)
          foodItems: JSON.stringify([
            { name: 'Oatmeal', portion: '1 bowl', calories: 300, protein: 10 },
            { name: 'Berries', portion: '1/2 cup', calories: 50, protein: 2 },
          ]),
          totalCalories: 350,
          totalProtein: 12,
        },
        {
          id: '2',
          foodItems: JSON.stringify([
            { name: 'Chicken Salad', portion: '1 plate', calories: 450, protein: 48 },
          ]),
          totalCalories: 450,
          totalProtein: 48,
        },
      ],
    }

    render(<TodayDashboard {...props} />)

    // Rings replace the text ratios
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('of 2,000 kcal')).toBeInTheDocument()
    expect(screen.getByText('of 150g protein')).toBeInTheDocument()

    // Test shows the meal rows with joined item names, not raw JSON
    expect(screen.getByText('Oatmeal, Berries')).toBeInTheDocument()
    expect(screen.getByText('350 cal • 12g protein')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('450 cal • 48g protein')).toBeInTheDocument()
  })

  it('renders the fallback label for unparseable foodItems', () => {
    const props = {
      consumed: { calories: 100, protein: 5, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: null,
      meals: [
        { id: '1', foodItems: 'not json', totalCalories: 100, totalProtein: 5 },
      ],
    }

    render(<TodayDashboard {...props} />)

    expect(screen.getByText('Meal')).toBeInTheDocument()
  })

  it('each meal row renders a delete button', () => {
    const props = {
      consumed: { calories: 800, protein: 60, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: null,
      meals: [
        { id: '1', foodItems: '[]', totalCalories: 300, totalProtein: 20 },
        { id: '2', foodItems: '[]', totalCalories: 500, totalProtein: 40 },
      ],
    }

    render(<TodayDashboard {...props} />)

    expect(screen.getAllByRole('button', { name: 'Delete meal' })).toHaveLength(2)
  })

  it('TodayDashboard prompts when no target is set', async () => {
    const props = {
      consumed: { calories: 0, protein: 0, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: null,
      meals: [],
    }

    render(<TodayDashboard {...props} />)

    // Test prompts when no target is set
    expect(screen.getByText('Set your daily targets')).toBeInTheDocument()
  })

  it('TodayDashboard shows the empty state', async () => {
    const props = {
      consumed: { calories: 0, protein: 0, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: { calories: 2000, protein: 150 },
      meals: [],
    }

    render(<TodayDashboard {...props} />)

    // Test shows the empty state
    expect(screen.getByText('No meals logged today')).toBeInTheDocument()
  })

  it('a photo meal renders its thumbnail', () => {
    const props = {
      consumed: { calories: 485, protein: 37, fat: 0 },
      fatQuality: { wholeFoodShare: null, label: null },
      processing: { naturalShare: null, label: null },
      target: null,
      meals: [
        {
          id: '1',
          foodItems: '[{"name":"Salmon"}]',
          totalCalories: 485,
          totalProtein: 37,
          photoUrl: 'https://blob/x.jpg',
        },
      ],
    }

    render(<TodayDashboard {...props} />)

    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://blob/x.jpg')
  })
})

describe('the fat ring', () => {
  const meals = [
    { id: 'm1', foodItems: '[{"name":"Avocado"}]', totalCalories: 300, totalProtein: 5 },
  ]

  it('draws full, because fat has no target', () => {
    // Not progress towards anything — fat guidance is a range, and a
    // denominator would read as failure for something only estimated. The
    // whole circle is drawn and the colour carries the meaning.
    render(
      <TodayDashboard
        consumed={{ calories: 300, protein: 5, fat: 20 }}
        fatQuality={{ wholeFoodShare: 1, label: 'whole food' }}
        processing={{ naturalShare: null, label: null }}
        target={{ calories: 2000, protein: 150 }}
        meals={meals}
      />
    )

    expect(screen.getByText('20g')).toBeInTheDocument()
    expect(screen.getByText('whole food')).toBeInTheDocument()
  })

  it('says the reading in words, not only in colour', () => {
    // Green and amber are among the hardest pairs to separate with red-green
    // colour vision deficiency, so hue cannot be the only channel.
    render(
      <TodayDashboard
        consumed={{ calories: 450, protein: 7, fat: 30 }}
        fatQuality={{ wholeFoodShare: 0.1, label: 'mostly refined' }}
        processing={{ naturalShare: null, label: null }}
        target={{ calories: 2000, protein: 150 }}
        meals={meals}
      />
    )

    expect(screen.getByText('mostly refined')).toBeInTheDocument()
  })

  it('says so plainly when no fat was logged', () => {
    render(
      <TodayDashboard
        consumed={{ calories: 80, protein: 3, fat: 0 }}
        fatQuality={{ wholeFoodShare: null, label: null }}
        processing={{ naturalShare: null, label: null }}
        target={{ calories: 2000, protein: 150 }}
        meals={meals}
      />
    )

    expect(screen.getByText('no fat logged')).toBeInTheDocument()
  })
})

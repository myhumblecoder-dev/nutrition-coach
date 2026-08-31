import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt, parseHealthFacts } from './extraction'

describe('extraction', () => {
  it('the prompt embeds seeds and the user message', () => {
    const prompt = buildExtractionPrompt(
      { meals: ['Salad'], training: [], recovery: [] },
      'I ran sprints'
    )

    expect(prompt).toContain('Already logged today')
    expect(prompt).toContain('Salad')
    expect(prompt).toContain('Message: I ran sprints')
  })

  it('a fenced response still parses', () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        meals: [],
        training: [{ kind: 'hiit', minutes: 20 }],
        recovery: [],
        mood: [],
        measurement: [],
      }) +
      '\n```'

    const facts = parseHealthFacts(fenced)

    expect(facts.training).toHaveLength(1)
    expect(facts.training[0].kind).toBe('hiit')
  })

  it('garbage input returns empty facts', () => {
    const facts = parseHealthFacts('no json here')

    expect(facts).toEqual({
      meals: [],
      training: [],
      recovery: [],
      mood: [],
      measurement: [],
    })
  })
})

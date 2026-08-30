import { nameInstruction, personalise } from '@/lib/ai-identity'

/**
 * The name is substituted on our own server rather than sent to OpenAI. These
 * cover the substitution and, more importantly, what happens when the model
 * ignores the instruction — that failure has to be invisible on the reveal
 * screen, not a visible template artefact.
 */
describe('personalise', () => {
  it('puts the first name where the placeholder is', () => {
    expect(personalise('{{NAME}}, your stack is built for mornings.', 'Sam'))
      .toBe('Sam, your stack is built for mornings.')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(personalise('{{ NAME }}, welcome.', 'Sam')).toBe('Sam, welcome.')
  })

  it('replaces every occurrence', () => {
    expect(personalise('{{NAME}} \u2014 this is {{NAME}}\u2019s stack.', 'Sam'))
      .toBe('Sam \u2014 this is Sam\u2019s stack.')
  })

  it('is stable across repeated calls on the same string', () => {
    // A shared /g regex would carry lastIndex and make the second call differ.
    const text = '{{NAME}}, your stack.'
    expect(personalise(text, 'Sam')).toBe(personalise(text, 'Sam'))
  })

  it('strips the placeholder and its dangling comma when there is no name', () => {
    expect(personalise('{{NAME}}, your stack is built for mornings.', null))
      .toBe('your stack is built for mornings.')
  })

  it('leaves copy without a placeholder untouched', () => {
    const text = 'Your stack is built for mornings.'
    expect(personalise(text, 'Sam')).toBe(text)
    expect(personalise(text, null)).toBe(text)
  })
})

describe('nameInstruction', () => {
  it('asks for the placeholder when there is a name, and never carries the name', () => {
    const instruction = nameInstruction('Sam')
    expect(instruction).toContain('{{NAME}}')
    expect(instruction).not.toContain('Sam')
  })

  it('is empty when there is no name, so the prompt says nothing about one', () => {
    expect(nameInstruction(null)).toBe('')
  })
})

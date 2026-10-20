import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blurBackground } from '../app/lib/templates/blurBackground.ts'
import { nikonBlur } from '../app/lib/templates/nikonBlur.ts'
import { standard2 } from '../app/lib/templates/standard2.ts'
import { resolveTextScale } from '../app/lib/processors/textScale.ts'

test('blur templates use the updated image margin bounds and defaults', () => {
  for (const template of [blurBackground, nikonBlur]) {
    assert.equal(template.userOptions.layout?.imageMargin, 0.12)
    assert.equal(template.userOptions.typography?.portraitScale, 0.9)

    const marginSteps = template.processors
      .filter((step: Record<string, any>) => step.scale_from_margin || step.weights_from_margin)
      .map((step: Record<string, any>) => step.scale_from_margin || step.weights_from_margin)

    assert.equal(marginSteps.length, 3)
    for (const margin of marginSteps) {
      assert.equal(margin.min_margin, 0.04)
      assert.equal(margin.default_margin, 0.12)
    }
  }
})

test('every shadow template defaults to the updated shadow strength', () => {
  for (const template of [blurBackground, nikonBlur, standard2]) {
    assert.equal(template.userOptions.shadow?.shadowRadius, 0.015)

    const shadowStep = template.processors
      .find((step: Record<string, any>) => step.processor_name === 'shadow') as Record<string, any>
    assert.equal(shadowStep.shadow_radius, 0.015)
  }
})

test('portrait text scaling reduces vertical fonts without changing landscape fonts', () => {
  assert.equal(resolveTextScale({ watermarkScale: 0.9 }, 1600, 900), 1)
  assert.equal(resolveTextScale({ watermarkScale: 0.9 }, 900, 1600), 0.9)
  assert.equal(resolveTextScale({ watermarkScale: 0.5 }, 900, 1600), 0.8)
  assert.equal(resolveTextScale({ watermarkScale: 2 }, 900, 1600), 1.2)
  assert.equal(resolveTextScale({}, 900, 1600), 1)
})

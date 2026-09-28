import assert from 'node:assert/strict'
import test from 'node:test'
import { getUpgradeChallenges, getChallengeReward } from '../src/utils/tycoonChallenges.js'

test('upgrade milestones enqueue each crossed challenge once', () => {
  const firstRun = getUpgradeChallenges(1, 10, [])
  assert.deepEqual(firstRun.map(challenge => challenge.id), ['upgrade-2', 'upgrade-5', 'upgrade-10'])
  assert.deepEqual(getUpgradeChallenges(1, 10, firstRun.map(challenge => challenge.id)), [])
})

test('correct answers award the challenge bonus and other answers do not', () => {
  const challenge = getUpgradeChallenges(1, 2)[0]
  const correctOption = challenge.choices.find(option => option.id === challenge.correctId)
  const incorrectOption = challenge.choices.find(option => option.id !== challenge.correctId)
  assert.equal(getChallengeReward(challenge, correctOption.id), challenge.reward)
  assert.equal(getChallengeReward(challenge, incorrectOption.id), 0)
  assert.equal(getChallengeReward(challenge, null), 0)
})